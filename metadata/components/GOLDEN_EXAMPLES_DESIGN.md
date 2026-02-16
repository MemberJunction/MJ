# Golden Example Components - Complete Implementation Guide

This document provides everything needed to implement 8 golden example components that demonstrate proper data loading patterns in MemberJunction React components.

## 🎉 PROJECT COMPLETE (2025-12-07)

**All 8 golden example components are production-ready with zero linter violations!**

### Final Status Summary

| # | Component | Type | Queries | Status | Violations | Libraries |
|---|-----------|------|---------|--------|------------|-----------|
| 1 | MonthlyInvoiceRevenue | Chart | 1 | ✅ Complete | 0 | Generic only |
| 2 | TopProductsRanking | Table | 1 | ✅ Complete | 0 | Generic only |
| 3 | AIModelAnalyticsDashboard | Dashboard | 3 | ✅ Complete | 0 | Generic only |
| 4 | AccountRevenueByType | Chart | 1 | ✅ Complete | 0 | Generic only |
| 5 | ProductCategoryAnalysis | Dashboard | 2 | ✅ Complete | 0 | Generic only |
| 6 | SubmissionReviewDashboard | Dashboard | 3 | ✅ Complete | 0 | Generic only |
| 7 | DealPipelineVisualization | Dashboard | 4 | ✅ Complete | 0 | **ApexCharts** |
| 8 | InvoiceAgingAnalysis | Dashboard | 3 | ✅ Complete | 0 | **D3.js** |

**Total: 8 components, 18 queries, 0 linter violations** 🚀

### 📚 Library Usage Patterns Demonstrated

The 8 golden examples now demonstrate **THREE distinct patterns**:

#### **Pattern 1: Generic Components Only** (6 components)
- MonthlyInvoiceRevenue, TopProductsRanking, AIModelAnalyticsDashboard
- AccountRevenueByType, ProductCategoryAnalysis, SubmissionReviewDashboard
- **Use Case**: Standard visualizations where generic components provide sufficient functionality
- **Decision Point**: Choose when rapid development and consistency are priorities

#### **Pattern 2: Hybrid - Specialized Library** (Component #7)
- **DealPipelineVisualization**: ApexCharts funnel + SimpleChart velocity
- **Use Case**: Mix specialized libraries for complex visualizations with generic components for simple ones
- **Technical Rationale**: ApexCharts has superior funnel chart support
- **Decision Point**: Choose when specific visualization types need specialized library features

#### **Pattern 3: Custom D3 Visualization** (Component #8)
- **InvoiceAgingAnalysis**: D3.js custom aging buckets + SimpleChart payment trends
- **Use Case**: Truly custom visualizations that require pixel-perfect control and unique interactions
- **Technical Rationale**: Color-coded risk levels with heatmap gradient not available in generic components
- **Decision Point**: Choose when generic components can't express the required visualization complexity

**Educational Value:**
- Shows the full spectrum: Generic → Specialized Library → Custom D3
- Demonstrates decision-making criteria for library selection
- Real-world pattern: most apps use a mix of all three approaches

### Key Achievements

1. **Query Pair Pattern Implementation:**
   - Deal Pipeline: Distribution (aggregation) + Details (raw data)
   - Outstanding Invoices + Top Accounts by Outstanding
   - Demonstrates best practice for drill-down patterns

2. **DataGrid Integration:**
   - Replaced EntityDataGrid with DataGrid in DealPipelineVisualization
   - Implemented OpenEntityRecord feature for seamless record navigation
   - Eliminated complex SQL filter construction in components

3. **SQL Query Refinements:**
   - Fixed field names to match actual database views (CloseDate, FullName, AccountType)
   - Added proper JOINs for denormalized fields
   - Aligned all parameters with actual SQL template implementations

4. **Component Linter Compliance:**
   - Fixed parameter mismatches in DealPipelineVisualization (StartDate/EndDate)
   - Removed invalid AgeBucket parameter from InvoiceAgingAnalysis
   - All components pass with zero violations

### Commits

1. **feat: Complete MonthlyInvoiceRevenue component** (fcc139bae)
2. **feat: Add golden example components shell metadata** (b8099013c)
3. **refactor: Improve component linter test structure** (9b90f02e4)
4. **feat: Add EntityDataGrid component** (4e0b1c076)
5. **feat: Refactor Deal Pipeline Visualization to use query pair pattern** (eccaed242)
6. **fix: Align query parameters with SQL templates** (e6ac472e2)

### 🔮 Future Library Refactoring Candidates

**Additional components that could be refactored to demonstrate different library patterns:**

#### **Option 1: InvoiceAgingAnalysis + D3.js** (High Priority)
- **Library**: D3.js (v7.8.5) ✅ Available
- **Use Case**: Custom aging bucket heatmap visualization
- **Current**: Uses SimpleChart for all visualizations
- **Proposed**: Replace aging buckets chart with custom D3 visualization (grouped bars + heatmap hybrid)
- **Educational Value**:
  - Demonstrates maximum customization when generic components aren't flexible enough
  - Shows D3.js integration for unique data visualizations
  - Illustrates the "escape hatch" for truly unique requirements
- **Complexity**: High (D3 has steep learning curve)

#### **Option 2: AIModelAnalyticsDashboard + ECharts** (Medium Priority)
- **Library**: ECharts ✅ Available
- **Use Case**: Advanced time-series chart with zoom/brush features
- **Current**: Uses SimpleChart for all 3 charts (doughnut, bar, line)
- **Proposed**: Replace time-series trend chart with ECharts for advanced interactions
- **Educational Value**:
  - Demonstrates when to upgrade from basic charting to enterprise-grade
  - Shows ECharts integration (Chinese origin, globally popular)
  - Illustrates feature-rich charting libraries
- **Complexity**: Medium (ECharts is easier than D3)

**Note**: These refactorings are **optional** and should only be done if additional pattern variety is needed for educational purposes. The current 7 generic + 1 hybrid (ApexCharts) mix is sufficient.

### Reference for Future Work

**Component Testing:**
```bash
cd /Users/jordanfanapour/Documents/GitHub/MJ/packages/React/component-linter-tests
npm run test:fixture fixtures/valid-components/[component-name].json
```

**Query Verification:**
```bash
DB_TRUST_SERVER_CERTIFICATE=1 sqlcmd -S sqlserver.local,1433 \
  -U MJ_CodeGen -P 'YourStrong@Passw0rd789' -d mj_test_2 \
  -Q "SELECT TOP 5 * FROM CRM.vw[EntityName]" -W -s"|"
```

**Key Learnings:**
- Always verify field names against actual database views using INFORMATION_SCHEMA.COLUMNS
- Use query pairs (aggregation + detail) for drill-down patterns
- Match spec parameters exactly with SQL template parameters
- DataGrid with OpenEntityRecord provides better UX than EntityDataGrid with SQL filters
- Component linter catches parameter mismatches early
- Choose specialized libraries (ApexCharts, D3, ECharts) when generic components lack needed features
- React is implicit - never list it in the libraries array
- Only list libraries that the component code directly uses (not dependencies' libraries)

---

## ✅ Document Updates (2025-12-03)

**Critical Corrections Made:**
- ✅ Added comprehensive **BaseView naming convention** documentation (`vw${PluralTableName}`)
- ✅ Documented **schema prefix requirement** (e.g., `CRM.vwAccounts`, not just `vwAccounts`)
- ✅ Created complete **BaseView reference tables** for CRM, Events, and MJ schemas
- ✅ Added **6 complete SQL query examples** using proper BaseView syntax
- ✅ Specified all **entity field details** and **lookup column patterns**
- ✅ Clarified that queries must **ONLY use BaseViews**, never tables directly
- ✅ **Shell files created** for all 7 remaining components (specs, code, fixtures, metadata records)
- ✅ **Component 1 (MonthlyInvoiceRevenue) fully implemented** with zero linter violations
- ✅ **16 query records created** with placeholder SQL files ready for implementation
- ✅ Added **Nunjucks best practices** and **Pre-Query Checklist** to prevent common errors
- ✅ Documented **dependencies array format** (must be array, not object)
- ✅ Clarified **"queries" vs "hybrid" mode** for EntityDataGrid drill-down patterns

**What's Ready:**
- ✅ Component 1 (MonthlyInvoiceRevenue) - **COMPLETE** and tested
- ✅ Components 2-8 - Shell files created, ready for implementation
- ✅ 17 Query records registered (1 complete, 16 with placeholder SQL)
- ✅ 7 Component linter fixtures created for testing
- Complete schema documentation for all CRM, Events, and MJ entities
- Working SQL query patterns for aggregations, JOINs, time-series, and computed columns
- React runtime architecture reference
- Component testing procedures

## ✅ Implementation Complete (2025-12-04)

**All Components Implemented:**
- ✅ **Components 2-8** - All implemented with zero linter violations
- ✅ **16 SQL queries** - All implemented with documented contracts
- ✅ **Multi-agent strategy** - Successfully executed with 4 parallel agents
- ✅ **Linter validation** - All 7 components pass with 0 violations

---

## 📝 Component Review & Refinement Phase (2025-12-04)

**Status:** IN PROGRESS

**Process:**
1. User reviews one component at a time (starting with account-revenue-by-type)
2. Feedback is documented in this section
3. Changes are applied to the reviewed component
4. Once approved, sub-agents analyze remaining components for similar issues
5. Consistent updates applied across all components

### Component Under Review: AccountRevenueByType

**Review Date:** 2025-12-04
**Reviewer:** User
**Status:** In Progress

#### Feedback Items:

**✅ SQL Query Performance:**
- Query works correctly with no parameters
- Returns accurate aggregations for Account Type, Account Count, Total Revenue, Avg Invoice, Invoice Count, Total Outstanding
- No changes needed to SQL

**❌ Issue 1: Chart Click Drill-Down Not Working**
- **Problem:** Clicking chart segments doesn't trigger EntityDataGrid drill-down
- **Root Cause 1:** Wrong column name in extraFilter - using `Type` instead of `AccountType`
- **Root Cause 2:** Missing Accounts entity from spec's entities section
- **Learning:** Always verify column names against actual entity schema
- **Learning:** Include all entities used in filters in the spec's entities section

**❌ Issue 2: Missing Date Filter UI**
- **Problem:** Component accepts startDate/endDate props but provides no UI to change them
- **Feature Request:** Add date picker UI when both startDate and endDate are null
- **Feature Request:** Apply date filters to EntityDataGrid extraFilter for consistency between chart and drill-down
- **Learning:** If component accepts filter props, provide UI controls when they're not externally controlled

**❌ Issue 3: Incomplete Spec**
- **Problem:** Missing technicalDesign section
- **Problem:** Missing event definitions (onSegmentClick, onRecordClick, etc.)
- **Learning:** All specs need complete technicalDesign documentation
- **Learning:** Components should expose events for external consumers

#### Action Items:

1. **Fix EntityDataGrid extraFilter:**
   - Change `Type='${selectedType}'` to `AccountType='${selectedType}'`
   - Add date filters: `AND InvoiceDate >= '${startDate}' AND InvoiceDate <= '${endDate}'` (when dates provided)

2. **Add Accounts entity to spec entities section:**
   - Include Display Fields
   - Include Filter Fields
   - Include Sort Fields
   - Document the AccountType column

3. **Add date filter UI to component:**
   - Check if both startDate and endDate are null
   - If null, render date picker controls above chart
   - Update internal state when dates change
   - Re-query data when dates change
   - Apply date filters to EntityDataGrid extraFilter

4. **Complete spec technicalDesign section:**
   - Document component architecture
   - Document state management
   - Document data flow
   - Document drill-down behavior

5. **Add event definitions to spec:**
   - onSegmentClick: Fired when chart segment clicked (passes account type data)
   - onRecordClick: Fired when EntityDataGrid row clicked (passes invoice record)
   - Document event payload structures

#### Changes Applied:

**1. Fixed EntityDataGrid extraFilter (Issue 1):**
- ✅ Changed `Type='${selectedType}'` to `AccountType='${selectedType}'`
- ✅ Added date filters: `InvoiceDate >= '${effectiveStartDate}'` AND `InvoiceDate <= '${effectiveEndDate}'`
- ✅ Created `buildEntityFilter()` helper function to construct filter with proper AND logic
- ✅ Verified column name against CRM schema documentation

**2. Added Accounts Entity to Spec (Issue 1):**
- ✅ Added Accounts entity to `dataRequirements.entities` array
- ✅ Documented displayFields: Name, AccountType, Status
- ✅ Documented filterFields: ID, AccountType, Status
- ✅ Documented sortFields: Name, CreatedAt
- ✅ Added usageContext explaining SQL subquery pattern
- ✅ Updated Invoices entity usageContext to show date filters

**3. Implemented Date Filter UI (Issue 2):**
- ✅ Added internal state: `internalStartDate`, `internalEndDate`
- ✅ Created computed values: `effectiveStartDate`, `effectiveEndDate` (props take precedence)
- ✅ Added conditional rendering: `showDateFilters` (only when both props are null)
- ✅ Implemented date picker controls (start date, end date, clear button)
- ✅ Applied effective dates to RunQuery parameters
- ✅ Applied effective dates to EntityDataGrid extraFilter for consistency
- ✅ Styled filter panel with gray background and flexbox layout

**4. Completed Spec technicalDesign Section (Issue 3):**
- ✅ Documented component architecture and data flow
- ✅ Documented state management (6 state variables)
- ✅ Documented conditional UI controls
- ✅ Documented filter coordination pattern
- ✅ Documented EntityDataGrid integration with filter construction
- ✅ Documented event system
- ✅ Added educational value section explaining patterns demonstrated

**5. Added Event Definitions (Issue 3):**
- ✅ Added `onSegmentClick` prop and handler in code
- ✅ Added `onRecordClick` prop and handler in code
- ✅ Added both props to spec `properties` array with descriptions
- ✅ Added both events to spec `events` array with payload schemas
- ✅ Documented payload structures with examples
- ✅ Implemented event firing in component code

**6. Additional Improvements:**
- ✅ Added comprehensive `exampleUsage` section in spec
- ✅ Verified linter passes with 0 violations
- ✅ Removed PropTypes (not allowed by linter's single-function-only rule)

**Files Modified:**
- `/metadata/components/code/query-examples/account-revenue-by-type.js` (338 lines)
- `/metadata/components/spec/query-examples/account-revenue-by-type.spec.json` (210 lines)

**Testing:**
- ✅ Linter validation: 0 violations
- ⏳ User testing: Awaiting user validation of fixes

**Additional Feedback from User (Round 2):**

**✅ Note:** Events should not be in properties array (already removed by user)

**❌ Issue 2a: Date Selector Triggers Too Early**
- **Problem:** Data reloads when only one date is entered
- **Solution:** Add "Apply Filters" button - only reload when user clicks it
- **Learning:** Don't trigger expensive operations until user completes all inputs

**❌ Issue 2b: Date Selector Disappears on Empty Data**
- **Problem:** "No data available" state hides date selectors, user can't recover
- **Solution:** Keep date filters visible even in loading/error/empty states
- **Learning:** Filter controls should always remain accessible for user to change criteria

**❌ Issue 1b: Chart Click Still Not Opening Grid**
- **Problem:** EntityDataGrid not rendering on segment click, no console logs for RunView
- **Root Cause:** Component not properly handling SimpleChart click event structure
- **Reference:** See simple-drilldown-chart.js for correct pattern
- **Learning:** SimpleChart onDataPointClick passes specific event structure with records array

**Changes Applied (Round 2):**

**1. Fixed Date Selector Behavior:**
- ✅ Split state into `pendingStartDate`/`pendingEndDate` (user input) and `appliedStartDate`/`appliedEndDate` (active filters)
- ✅ Added "Apply Filters" button that only triggers when BOTH dates are entered
- ✅ Button is disabled with gray background when dates incomplete
- ✅ "Clear Dates" button only shows when filters are applied
- ✅ Data reload only triggered by appliedStartDate/appliedEndDate changes

**2. Fixed Date Filters Visibility:**
- ✅ Moved date filter panel outside of loading/error/empty state conditionals
- ✅ Date filters now render at top of component ALWAYS (when showDateFilters is true)
- ✅ Loading, error, and empty states render BELOW filters
- ✅ User can always adjust date range even when no data returned

**3. Fixed Chart Click Drill-Down:**
- ✅ Renamed `selectedType` state to `selectedSegment` to match SimpleChart event structure
- ✅ Changed handler from `handleSegmentClick` to `handleChartClick` following simple-drilldown-chart pattern
- ✅ Added console.log in click handler for debugging
- ✅ Updated all references to use `selectedSegment.label` instead of `selectedType`
- ✅ Fixed EntityDataGrid filter to use `selectedSegment.label` for AccountType
- ✅ Changed EntityDataGrid `onRecordClick` to `onRowClick` (correct prop name)
- ✅ Updated chart to only render when data exists and no segment selected
- ✅ EntityDataGrid now renders in its own container below header

**Files Modified (Round 2):**
- `/metadata/components/code/query-examples/account-revenue-by-type.js` (365 lines)
- `/metadata/components/GOLDEN_EXAMPLES_DESIGN.md` (documentation updates)

**Testing (Round 2):**
- ✅ Linter validation: 0 violations
- ✅ User testing: Chart click drill-down working!

**Additional Feedback from User (Round 3 - UI Polish):**

**✅ Success:** EntityDataGrid now renders on chart click!

**UI Issue 1: Chart Disappears on Drill-Down**
- **Problem:** Chart is hidden when EntityDataGrid renders, grid takes over full page
- **Desired Behavior:** Show both chart AND grid simultaneously (chart on top, grid below)
- **Reference:** SimpleDrilldownChart keeps chart visible during drill-down
- **Learning:** Drill-down should be additive, not replacement

**UI Issue 2: Date Filter Width Inconsistent**
- **Problem:** Date filter bar width changes based on whether chart/data is rendered
  - With data/chart: Full width of container
  - Without data: Truncated/narrow
- **Desired Behavior:** Date filter should maintain constant width regardless of content below
- **Learning:** Filter controls should have stable layout independent of dynamic content

**Changes Applied (Round 3):**

**1. Fixed Chart Visibility During Drill-Down:**
- ✅ Removed `!selectedSegment` condition from chart rendering
- ✅ Chart now remains visible at all times when data is loaded
- ✅ EntityDataGrid renders BELOW the chart with `marginTop: '32px'`
- ✅ Moved header section into drill-down container
- ✅ Added visual styling to drill-down header (light blue background, border)
- ✅ Changed button text from "Back to Overview" to "Clear Selection"
- ✅ Layout now follows SimpleDrilldownChart pattern: Chart → Drill-down header → Grid

**2. Fixed Date Filter Width:**
- ✅ Added `width: '100%'` to outer container
- ✅ Added `width: '100%'` to date filter panel
- ✅ Added `boxSizing: 'border-box'` to date filter panel
- ✅ Date filter now maintains constant full width regardless of content state
- ✅ Filter panel width stable across loading/error/empty/data states

**Visual Improvements:**
- ✅ Drill-down header has blue theme matching selection context (#e6f7ff background, #91d5ff border)
- ✅ Clear separation between chart and drill-down sections (32px margin)
- ✅ Button styling consistent (14px font, 500 weight)
- ✅ Improved visual hierarchy

**Files Modified (Round 3):**
- `/metadata/components/code/query-examples/account-revenue-by-type.js` (378 lines)
- `/metadata/components/GOLDEN_EXAMPLES_DESIGN.md` (documentation updates)

**Testing (Round 3):**
- ✅ Linter validation: 0 violations
- ✅ User testing: Chart remains visible during drill-down!

**Additional Feedback from User (Round 4 - Critical Fixes):**

**UI Issue 3: Date Filter Width Still Not Stable**
- **Problem:** Date filter bar still reduces width when no data is available
- **Root Cause:** Parent container shrinks when SimpleChart is not present
- **Solution:** Add `minWidth: '800px'` to outer container for stable layout

**❌ CRITICAL Issue: EntityDataGrid Pagination Not Working**
- **Problem:** "Next" page button not working in the EntityDataGrid
- **Root Cause:** Missing required EntityDataGrid props
- **Investigation:** Compared to test-entity-data-grid.js which works correctly
- **Missing Props:**
  - `pageSize` - **CRITICAL** for pagination to work
  - `orderBy` - Default sort order
  - `enablePageCache` - Performance optimization
  - `showPageSizeChanger` - User can change page size
  - `enableSorting` - Column sorting
  - `enableFiltering` - Column filtering
  - `showRefreshButton` - Manual refresh capability

**Changes Applied (Round 4):**

**1. Fixed Container Width:**
- ✅ Added `minWidth: '800px'` to outer container
- ✅ Prevents container from collapsing when chart hidden
- ✅ Date filter maintains stable width across all states

**2. Fixed EntityDataGrid Pagination:**
- ✅ Added `pageSize={20}` - **CRITICAL FIX** - enables pagination
- ✅ Added `orderBy="InvoiceDate DESC"` - default sort
- ✅ Added `enablePageCache={true}` - cache pages for performance
- ✅ Added `showPageSizeChanger={true}` - allow user to change page size
- ✅ Added `enableSorting={true}` - enable column sorting
- ✅ Added `enableFiltering={true}` - enable column filtering
- ✅ Added `showRefreshButton={true}` - allow manual refresh

**Files Modified (Round 4):**
- `/metadata/components/code/query-examples/account-revenue-by-type.js` (384 lines)
- `/metadata/components/GOLDEN_EXAMPLES_DESIGN.md` (documentation updates)

**Testing (Round 4):**
- ✅ Linter validation: 0 violations
- ⏳ User testing: Awaiting validation of pagination fix

**Key Learning:**
- ~~EntityDataGrid requires `pageSize` prop for pagination to work~~ **FIXED** - EntityDataGrid now has default pageSize=20
- Always reference working examples (like test-entity-data-grid.js) when integrating complex components
- Enable standard features (sorting, filtering, refresh) for better UX

**NOTE**: User fixed EntityDataGrid bug - pageSize default is now 20, prop not required.

---

### Component Under Review: TopProductsRanking (Component 2)

**Review Date:** 2025-12-07
**Reviewer:** User
**Status:** Complete ✅

#### Initial Issues Found:

**❌ Issue 1: Column Sorting Not Working**
- **Problem:** Clicking column headers showed sort icons but sorting was non-functional
- **Impact:** Affected ALL DataGrid components (global regression)
- **Root Cause:** Commit 3416fb50 added `sortOrder: colDef.sortOrder` which set `sortOrder: undefined` for uncontrolled sorting
- **Why This Broke:** When Ant Design Table sees `sortOrder` property (even if undefined), it treats the column as controlled mode with no sort order, which disables the internal sorter function
- **Learning:** Omit `sortOrder` property entirely for uncontrolled sorting; only add it when explicitly provided for controlled mode

**❌ Issue 2: Column Headers Lack Spaces**
- **Problem:** Multi-word column names displayed without spaces: "TotalRevenue" instead of "Total Revenue"
- **User Feedback:** "Columns with multiple words like 'TotalRevenue' should have a space in between each word"
- **Learning:** Always use human-readable column headers with proper spacing

**❌ Issue 3: Currency Values Hard to Read**
- **Problem:** Currency values displayed as raw numbers: `12345.67`
- **User Feedback:** "Values in the 'TotalRevenue' column are hard to read. Can you use the styling of the DataGrid 'Columns' property to render the values in a more readable way like '$xxx,xxx.xx'"
- **Learning:** Apply locale-specific formatting to currency and numeric values for better UX

**❌ Issue 4: Wrong DataGrid API Usage**
- **Problem:** Used incorrect property names from EntityDataGrid API instead of DataGrid API
- **Incorrect Props:** `headerName`, `valueFormatter`, `initialSort`, `enableSorting`, `enablePageCache`, `enableFiltering`, `showRefreshButton`
- **Correct Props:** `header`, `render`, no `initialSort`, `sorting={true}`, `paging={true}`, `filtering={true}`
- **Learning:** Verify component API by reading the actual component code; don't assume similar components have identical APIs

#### Changes Applied:

**1. Fixed DataGrid Column Sorting (Global Fix):**

**Core Issue - sortOrder Conditional Logic:**
```javascript
// ❌ BEFORE (in data-grid.js) - Always set sortOrder
return {
  title: displayName,
  dataIndex: fieldName,
  sorter: ...,
  sortOrder: colDef.sortOrder, // ⚠️ Setting undefined breaks uncontrolled mode!
  render: ...
};

// ✅ AFTER - Only add sortOrder if explicitly provided
const columnDef = {
  title: displayName,
  dataIndex: fieldName,
  sorter: (colDef.sortable !== undefined ? colDef.sortable : sorting) ? (a, b) => {
    const valA = a[fieldName];
    const valB = b[fieldName];
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === 'string') {
      return valA.localeCompare(valB);
    }
    return valA - valB;
  } : false,
  render: ...
};

// Only add sortOrder if explicitly provided (for controlled sorting)
if (colDef.sortOrder !== undefined) {
  columnDef.sortOrder = colDef.sortOrder;
}

return columnDef;
```

**Why This Fix Works:**
- **Uncontrolled Mode:** When `sortOrder` property is omitted, Ant Design uses the `sorter` function for internal sorting
- **Controlled Mode:** When `sortOrder` is explicitly set (e.g., 'ascend', 'descend'), parent manages sort via `onSortChanged`
- **The Bug:** Setting `sortOrder: undefined` made Ant Design think it was controlled mode with no active sort, which disabled the sorter function

**Sorter Logic Reverted:**
```javascript
// ❌ BROKEN (from commit 3416fb50) - Complex IIFE that checked shouldSort === true
sorter: (() => {
  const shouldSort = colDef.sortable !== undefined ? colDef.sortable : sorting;
  if (shouldSort === true) return true; // ⚠️ Returns true instead of sorter function!
  if (shouldSort) {
    return (a, b) => { /* sorting logic */ };
  }
  return false;
})(),

// ✅ FIXED - Simple ternary expression
sorter: (colDef.sortable !== undefined ? colDef.sortable : sorting) ? (a, b) => {
  const valA = a[fieldName];
  const valB = b[fieldName];
  if (valA == null) return 1;
  if (valB == null) return -1;
  if (typeof valA === 'string') {
    return valA.localeCompare(valB);
  }
  return valA - valB;
} : false,
```

**Three-State Sorting Preserved:**
- The handleTableChange logic from commit 3416fb50 was **kept** (not reverted)
- Enables three-state sorting: ascend → descend → clear (return to original order)
- Required for EntityDataGrid's adaptive caching feature
- Allows EntityDataGrid to restore original data order without server reload in full cache mode

**2. Fixed Column Headers with Proper Spacing:**
```javascript
// ❌ BEFORE - String array with no control over display
columns={['ProductName', 'Category', 'TotalRevenue', 'TotalQuantity', 'InvoiceCount', 'AvgPrice']}

// ✅ AFTER - Object array with header property
columns={[
  { field: 'ProductName', header: 'Product Name', sortable: true },
  { field: 'Category', header: 'Category', sortable: true },
  { field: 'TotalRevenue', header: 'Total Revenue', sortable: true, render: ... },
  { field: 'TotalQuantity', header: 'Total Quantity', sortable: true, render: ... },
  { field: 'InvoiceCount', header: 'Invoice Count', sortable: true, render: ... },
  { field: 'AvgPrice', header: 'Avg Price', sortable: true, render: ... }
]}
```

**3. Applied Currency and Number Formatting:**
```javascript
// Currency formatting with locale-specific separators
{
  field: 'TotalRevenue',
  header: 'Total Revenue',
  sortable: true,
  render: (value) => {
    return value != null
      ? `$${Number(value).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      : '$0.00';
  }
}

// Integer formatting with thousands separators
{
  field: 'TotalQuantity',
  header: 'Total Quantity',
  sortable: true,
  render: (value) => {
    return value != null ? Number(value).toLocaleString() : '0';
  }
}

// Decimal formatting with 2 decimal places
{
  field: 'AvgPrice',
  header: 'Avg Price',
  sortable: true,
  render: (value) => {
    return value != null
      ? `$${Number(value).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}`
      : '$0.00';
  }
}
```

**4. Fixed DataGrid API Usage:**
```javascript
// ❌ BEFORE - Wrong API props
<DataGrid
  data={products}
  columns={...}
  enableSorting={true}        // ❌ Wrong prop name
  enablePaging={true}          // ❌ Wrong prop name
  enableFiltering={true}       // ❌ Wrong prop name
  showRefreshButton={true}     // ❌ Not a DataGrid prop
  enablePageCache={true}       // ❌ Not a DataGrid prop
  initialSort={...}            // ❌ Not a DataGrid prop
/>

// ✅ AFTER - Correct API props
<DataGrid
  data={products}
  columns={columns}            // ✅ Column objects with header, render, sortable
  sorting={true}               // ✅ Correct prop name
  paging={true}                // ✅ Correct prop name
  filtering={true}             // ✅ Correct prop name
  onRowClick={handleRowClick}
  utilities={utilities}
  styles={styles}
  components={components}
  callbacks={callbacks}
/>
```

**API Differences - DataGrid vs EntityDataGrid:**

| Feature | DataGrid Prop | EntityDataGrid Prop |
|---------|---------------|---------------------|
| Column Headers | `header` | String field name or object with `field` |
| Cell Formatting | `render` | `render` (same) |
| Enable Sorting | `sorting={true}` | `enableSorting={true}` |
| Enable Paging | `paging={true}` | `pageSize={20}` (built-in pagination) |
| Enable Filtering | `filtering={true}` | `enableFiltering={true}` |
| Refresh Button | N/A (not supported) | `showRefreshButton={true}` |
| Page Cache | N/A (not supported) | `enablePageCache={true}` |
| Initial Sort | N/A (not supported) | `orderBy="FieldName DESC"` |

**Files Modified:**
- `/metadata/components/code/data-grid.js` (core component - global fix)
- `/metadata/components/code/query-examples/top-products-ranking.js` (component-specific)
- `/metadata/components/spec/query-examples/top-products-ranking.spec.json` (updated spec)
- `/SQL Scripts/demo/metadata/queries/SQL/top-products-ranking.sql` (query enhancements)

**Testing:**
- ✅ Linter validation: 0 violations
- ✅ User testing: "Nice, those final fixes made the sorting functional"
- ✅ Sorting now works in ALL DataGrid components (global regression fixed)
- ✅ Column headers display with proper spacing
- ✅ Currency values formatted as "$xxx,xxx.xx"
- ✅ Numeric values formatted with thousands separators

#### Key Learnings:

**1. Ant Design Table Controlled vs Uncontrolled Sorting:**
- **Controlled Mode:** Parent manages sort state via `sortOrder` prop + `onSortChanged` callback
- **Uncontrolled Mode:** Component manages sort internally via `sorter` function
- **Critical:** Setting `sortOrder: undefined` breaks uncontrolled mode - omit the property entirely

**2. DataGrid Component Integration:**
- Always verify API by reading actual component code
- Don't assume similar components (DataGrid vs EntityDataGrid) have identical APIs
- DataGrid is lower-level and wraps Ant Design Table directly
- EntityDataGrid is higher-level and adds entity-aware features

**3. Progressive Enhancement Pattern:**
- Start with simple string array for columns (basic functionality)
- Upgrade to object array for custom headers and formatting (enhanced UX)
- Object format: `{ field, header, sortable, render }`

**4. Number Formatting Best Practices:**
- Always use `Number(value).toLocaleString()` for user-facing numbers
- Specify `minimumFractionDigits` and `maximumFractionDigits` for currency
- Handle null/undefined values with fallback display
- Use locale parameter ('en-US') for consistent formatting

**5. Debugging Approach for Global Regressions:**
- Check recent commits for changes to shared components
- Test fix in isolation before applying across codebase
- Verify both controlled and uncontrolled modes work correctly
- Consider impact on all consumers of the component

---

## 🔄 Component Review & Refinement - Remaining Components (2025-12-07)

### Status: READY TO APPLY FIXES TO REMAINING 5 COMPONENTS

**Completed:**
- ✅ Component 4: AccountRevenueByType - Fully reviewed and refined (4 rounds)
- ✅ Component 2: TopProductsRanking - Fully reviewed and refined (DataGrid sorting fixed globally)

**Remaining Components:**
- ⏳ Component 3: AIModelAnalyticsDashboard
- ⏳ Component 5: ProductCategoryAnalysis
- ⏳ Component 6: SubmissionReviewDashboard
- ⏳ Component 7: DealPipelineVisualization
- ⏳ Component 8: InvoiceAgingAnalysis

### Master Checklist - Apply to All Components

Based on AccountRevenueByType review, check and fix:

#### 1. **Date Filter UI Pattern** (if component has date filters)
- [ ] Split state into pending (user input) and applied (active filters)
- [ ] Add "Apply Filters" button that requires both dates
- [ ] Only reload data when user clicks Apply
- [ ] Keep date filters visible in all states (loading/error/empty)
- [ ] Set container `minWidth` to prevent width collapse
- [ ] Add "Clear Dates" button when filters applied

#### 2. **Chart Click Drill-Down Pattern** (if component uses SimpleChart + EntityDataGrid)
- [ ] Use `selectedSegment` state (not `selectedType`)
- [ ] Handler receives `clickData` with `label`, `value`, `records`
- [ ] Use `clickData.label` for filtering
- [ ] Chart remains visible during drill-down (don't hide it)
- [ ] EntityDataGrid renders BELOW chart with proper spacing
- [ ] Add drill-down header with blue theme (#e6f7ff, #91d5ff border)
- [ ] Use "Clear Selection" button text

#### 3. **EntityDataGrid Configuration** (if component uses EntityDataGrid)
- [ ] ~~Remove explicit `pageSize={20}`~~ **Not needed - now has default**
- [ ] Add `orderBy` prop with sensible default
- [ ] Add `enablePageCache={true}`
- [ ] Add `showPageSizeChanger={true}`
- [ ] Add `enableSorting={true}`
- [ ] Add `enableFiltering={true}`
- [ ] Add `showRefreshButton={true}`
- [ ] Use `onRowClick` (not `onRecordClick`)
- [ ] Verify `extraFilter` uses correct column names from schema

#### 4. **Entities Section in Spec** (all components)
- [ ] Include ALL entities used in filters/queries
- [ ] Document displayFields, filterFields, sortFields
- [ ] Document column names used in SQL filters
- [ ] Add usageContext explaining how entity is used

#### 5. **Events in Spec** (all components)
- [ ] Add `events` array with all user interactions
- [ ] Document payload structure for each event
- [ ] Provide example payloads
- [ ] ~~Remove events from properties array~~ **Already noted**

#### 6. **TechnicalDesign Section** (all components)
- [ ] Document component architecture
- [ ] Document data flow (query → chart → drill-down)
- [ ] Document state management
- [ ] Document filter coordination
- [ ] Document EntityDataGrid integration
- [ ] Document event system
- [ ] Add educational value section

#### 7. **ExampleUsage Section** (all components)
- [ ] Basic usage example
- [ ] With external filters example
- [ ] With event handlers example
- [ ] With custom configuration example

#### 8. **Container Styling** (all components)
- [ ] Outer container: `width: '100%', minWidth: '800px', boxSizing: 'border-box'`
- [ ] Filter panels: `width: '100%', boxSizing: 'border-box'`
- [ ] Prevents layout shifts across states

---

## 🤖 Multi-Agent Implementation Strategy (RECOMMENDED)

For optimal efficiency and quality, use a **hybrid approach** with SQL implemented by one agent and components implemented in parallel by multiple agents.

### Strategy Overview

**Sequential SQL Implementation (Single Agent)**
- ✅ One agent implements all 16 SQL queries in order
- ✅ Builds expertise in Nunjucks templating and parameter patterns
- ✅ Ensures consistency across all queries
- ✅ Documents query contracts immediately after testing

**Parallel Component Implementation (Multiple Agents)**
- ✅ Launch 2-3 agents simultaneously for faster delivery
- ✅ Each agent implements 2-3 components
- ✅ Components grouped by complexity and pattern similarity
- ✅ All agents follow same coding standards from Component 1

### Agent Assignment

**SQL Agent (Queries 1-16)**
- Implements all 16 SQL queries sequentially
- Tests each query in SQL Server Management Studio
- Documents query contracts in component specs
- **Checkpoint**: After queries 1-8, can save context and continue if needed
- **Deliverable**: All 16 SQL files complete with working queries + documented contracts

**Component Agent 1 (Components 1-3) - RunQuery-Only Patterns**
- Component 1: MonthlyInvoiceRevenue ✅ (already complete - use as reference)
- Component 2: TopProductsRanking (simple hybrid, manual drill-down)
- Component 3: AIModelAnalyticsDashboard (multi-query coordination)
- **Focus**: Master SimpleChart usage, multi-query patterns, no EntityDataGrid

**Component Agent 2 (Components 4-6) - Simple to Moderate Hybrid**
- Component 4: AccountRevenueByType (simple hybrid pattern)
- Component 5: ProductCategoryAnalysis (multi-level drill-down)
- Component 6: SubmissionReviewDashboard (complex hybrid with EntityDataGrid)
- **Focus**: EntityDataGrid integration, conditional queries, multi-panel layouts

**Component Agent 3 (Components 7-8) - Expert to Master Hybrid**
- Component 7: DealPipelineVisualization (expert-level multi-query coordination)
- Component 8: InvoiceAgingAnalysis (master-level with interactive filters)
- **Focus**: Complex state management, filter panels, 4-level drill-downs

### Coordination Requirements

**All agents MUST:**
1. ✅ Complete Phase 3 (Review Dependency Component Specs) before coding
2. ✅ Use Component 1 (MonthlyInvoiceRevenue) as reference for:
   - Code structure and organization
   - Error handling patterns (try-catch with result.Success checks)
   - Loading state management
   - Comment style and clarity
3. ✅ Follow same naming conventions:
   - camelCase for variables and functions
   - Descriptive names (no abbreviations)
   - Clear state variable names (data, loading, error, selectedX)
4. ✅ Use consistent error handling:
   - Always check `result.Success` for RunQuery/RunView
   - Use try-catch blocks for async operations
   - Display user-friendly error messages
5. ✅ Run component linter before marking complete
6. ✅ Test component in UI and verify behavior

### Parallel Execution Command

To launch all component agents simultaneously:
```bash
# From the repository root, use Claude Code to launch 3 agents in parallel
# Agent 1: "Implement Components 2-3 following the Golden Examples design"
# Agent 2: "Implement Components 4-6 following the Golden Examples design"
# Agent 3: "Implement Components 7-8 following the Golden Examples design"
```

### Quality Gates

**SQL Agent Completion Criteria:**
- ☐ All 16 SQL files have working queries
- ☐ All queries tested in SQL Server Management Studio
- ☐ All query contracts documented in component specs (fields + parameters)
- ☐ Nunjucks templating follows best practices (same-line approach)

**Component Agent Completion Criteria:**
- ☐ All assigned components have complete code files
- ☐ All components pass linter with zero violations
- ☐ All components tested in UI with working behavior
- ☐ Error handling and loading states verified
- ☐ Dependency components used correctly (verified via spec review)

### Benefits of This Approach

**Speed:**
- SQL queries completed in one focused session
- 3 components implemented simultaneously (2-3x faster than sequential)

**Quality:**
- SQL consistency from single agent
- Component consistency from shared reference (Component 1)
- Each agent specializes in specific pattern complexity level

**Learning:**
- SQL agent builds templating expertise progressively
- Component agents learn from Component 1 reference implementation
- Agents don't repeat each other's mistakes (independent contexts)

**Scalability:**
- Easy to add more component agents if needed
- Clear division of work for progress tracking
- Can checkpoint and resume if context limits reached

---

## 📋 Implementation Workflow (UPDATED)

### ✅ Phase 0: Shell Files Created (DONE)
All shell metadata records, spec files, code files, and fixtures have been created. SQL Agent can implement queries, Component Agents can implement components in parallel.

### Phase 1: Implement SQL Queries
**For each component, implement the SQL queries first:**
1. ☐ Edit the placeholder SQL file in `SQL Scripts/demo/metadata/queries/SQL/`
2. ☐ Follow the Pre-Query Checklist (see below) to avoid common errors
3. ☐ Use Nunjucks templating for parameters (e.g., `{% if Year %}`, `{{ Year | sqlNumber }}`)
4. ☐ **TEST THE QUERY** - Run it manually in SQL Server Management Studio or Azure Data Studio
5. ☐ Verify the query returns the expected fields with correct data types
6. ☐ Update the `TechnicalDescription` field in `.queries.json` with implementation details

### Phase 2: Document Query Contract in Component Spec
**🚨 CRITICAL: After SQL is tested and working, document the query contract:**

**For EACH query the component uses, you MUST add the query contract to the component spec file.**

1. ☐ Open the component spec file in `metadata/components/spec/query-examples/[component-name].spec.json`
2. ☐ Find the `dataRequirements.queries` array
3. ☐ For each query, add a complete query contract with:
   - **fields** array - One entry for EACH field the SQL query returns (check your SELECT statement)
   - **parameters** array - One entry for EACH Nunjucks variable used in the query
   - **entityNames** array - List all entities the query touches (for context)

**Use `monthly-invoice-revenue.spec.json` as your reference example!**

**Example fields entry (document what the query RETURNS):**
```json
{
  "name": "TotalRevenue",
  "sequence": 1,
  "defaultInView": true,
  "type": "decimal(18,2)",
  "allowsNull": false,
  "isPrimaryKey": false,
  "description": "SUM of TotalAmount for all invoices in the time period"
}
```

**Example parameters entry (document what the query ACCEPTS):**
```json
{
  "name": "Year",
  "isRequired": false,
  "type": "number",
  "sampleValue": "2024",
  "description": "Filter invoices to a specific year. Uses YEAR(InvoiceDate) for filtering."
}
```

**⚠️ Common Mistakes to Avoid:**
- ❌ Don't copy entity field definitions - document what the QUERY returns
- ❌ Don't guess field types - check what SQL returns (INT, DECIMAL(18,2), NVARCHAR(50), etc.)
- ❌ Don't skip parameters - document ALL Nunjucks variables used in the SQL
- ❌ Don't document fields the query doesn't return - only what's in your SELECT statement

### Phase 3: Review Dependency Component Specs
**🚨 CRITICAL: Before writing any component code, review the specs of ALL dependency components:**

**Why This Matters:** Component specs document props, defaults, and behavior. Misunderstanding defaults (like SimpleChart's sorting) can cause bugs that are hard to debug.

**For EACH dependency listed in your component spec:**
1. ☐ Open the dependency's spec file in `metadata/components/spec/[component-name].spec.json`
2. ☐ Read the `description` and `functionalRequirements` - understand what the component does
3. ☐ Review ALL properties in the `properties` array:
   - What props are **required** vs optional?
   - What are the **default values**?
   - Are the defaults what you expect, or do you need to override them?
4. ☐ Check the `exampleUsage` section - see how the component is typically used
5. ☐ Pay special attention to props that control behavior (sorting, filtering, aggregation)

**Common Dependency Components and Key Props to Review:**

**SimpleChart** (`metadata/components/spec/simple-chart.spec.json`)
- `sortBy` (default: `undefined` - preserves input order)
- `aggregateMethod` (default: `"count"` - use `"sum"` for pre-aggregated data)
- `chartType` (default: `"auto"`)
- `groupBy` (required)
- `valueField` (required for sum/average/min/max)

**EntityDataGrid** (`metadata/components/spec/entity-data-grid.spec.json`)
- `entityName` (required)
- `extraFilter` (SQL WHERE clause without WHERE keyword)
- `fields` (columns to display)
- `maxCachedRows` (default: determines caching strategy)

**DataGrid** (`metadata/components/spec/data-grid.spec.json`)
- `data` (required - any array of objects)
- `columns` (field names or ColumnDef objects)
- `entityName` (optional - enables metadata-aware formatting)

**Example Checklist for Component 1 (MonthlyInvoiceRevenue):**
- ✅ Reviewed SimpleChart spec
- ✅ Noted `sortBy` defaults to `undefined` (preserves order) - perfect for time-series!
- ✅ Noted `aggregateMethod` defaults to `"count"` - must set to `"sum"` for pre-aggregated revenue
- ✅ Reviewed `exampleUsage` - saw time-series example pattern
- ✅ Ready to implement with correct props

### Phase 4: Implement Component Code
**After reviewing dependency specs:**
1. ☐ Edit the component code file in `metadata/components/code/query-examples/`
2. ☐ Implement data loading with `utilities.rq.RunQuery()`
3. ☐ Add component `properties` that map to query parameters
4. ☐ Implement state management and rendering
5. ☐ Pass correct props to dependency components (based on spec review)
6. ☐ Update `FunctionalRequirements` and `TechnicalDesign` in `.components.json`

### Phase 5: Test Component
**Run linter test to verify zero violations:**
```bash
cd packages/React/component-linter-tests
npm run test:fixture fixtures/valid-components/[component-name].json
```
Fix any violations, re-test until clean, then move to next component

### Phase 6: Final Validation (After All Components Complete)
**🚨 MANDATORY: Validate ALL query contracts match the final SQL:**

After testing and refining all queries, you MUST validate that the component specs accurately reflect the final SQL:

1. ☐ For EACH component, open both:
   - The SQL file: `SQL Scripts/demo/metadata/queries/SQL/[query-name].sql`
   - The component spec: `metadata/components/spec/query-examples/[component-name].spec.json`

2. ☐ For EACH query in the component spec, verify:
   - **Fields match exactly**: Every field in the SELECT statement has an entry in the spec
   - **Field types are correct**: SQL types match spec types (INT, DECIMAL(18,2), NVARCHAR(50), etc.)
   - **Parameters match exactly**: Every `{% if Variable %}` or `{{ Variable }}` has a parameter entry
   - **Parameter types are correct**: string, number, date match the SQL filter usage
   - **Description accuracy**: Field and parameter descriptions match what the SQL actually does

3. ☐ Update any mismatches found during refinement

**Why This Matters:** Component specs are the contract between the query and the component code. If they don't match the actual SQL, the component will fail at runtime or have incorrect behavior.

---

## 🎓 Key Learnings from Component 1 Implementation

### Critical Fixes Applied to Linter
- **Fixed line 8463 bug**: Added null check `queryDef?.parameters &&` before accessing `.length`
- This prevented "Cannot read properties of undefined (reading 'length')" error

### Component Spec Requirements
1. **Must include `code` property**: `"code": "@file:../../code/query-examples/component-name.js"`
2. **Must include `entityNames` array** in query definitions (even if using aggregated data)
3. **Dependencies must be array format**, not object with libraries/components properties:
   ```json
   "dependencies": [
     {
       "name": "SimpleChart",
       "location": "registry",
       "namespace": "Generic/UI/Chart",
       "version": "^1.0.0"
     }
   ]
   ```
4. **Libraries should only be declared** if directly used by the component (not if used by child components)

### RunQuery Best Practices
1. **Always include `CategoryPath`**: `CategoryPath: 'Demo'`
2. **Use `Parameters` not `Params`**: Correct property name is `Parameters`
3. **Check `result.Success`**: RunQuery doesn't throw, it returns success/failure in result object

### Component Code Patterns
1. **Pass all standard props to child components**: `utilities`, `styles`, `components`
2. **EntityDataGrid requires `entityName`** even if showing aggregated data
3. **Use proper error handling** with try-catch and check `result.Success`

### Nunjucks Template Best Practices
1. **Same-line approach prevents newline issues**:
   ```sql
   {% if Year %}  AND YEAR(i.InvoiceDate) = {{ Year | sqlNumber }}
   {% endif %}GROUP BY
   ```
2. **Avoid whitespace control characters** (`{%-`, `-%}`) - they can cause unpredictable behavior
3. **Put SQL content on same line as closing `%}`** to preserve newlines properly

### Data Requirements Mode
- **"queries" mode**: Component only calls RunQuery (even if using EntityDataGrid for drill-downs)
- **"hybrid" mode**: Component calls BOTH RunQuery AND RunView directly in its own code
- **"views" mode**: Component only calls RunView
- **EntityDataGrid handles RunView internally** - parent component doesn't need hybrid mode for drill-downs

### Hybrid Mode Examples
**Two components demonstrate different hybrid patterns:**

1. **TopProductsRanking (Component 2)** - Simple Hybrid Pattern
   - Uses RunQuery for aggregated product rankings
   - Calls RunView directly when user clicks a product
   - Displays detail records in standard DataGrid (NOT EntityDataGrid)
   - **Why hybrid**: Demonstrates manual drill-down control and custom data filtering

2. **SubmissionReviewDashboard (Component 6)** - Complex Hybrid Pattern
   - Uses multiple RunQuery calls for status summary and timeline charts
   - Calls RunView to load "Top Reviewers" reference data
   - Uses EntityDataGrid for drill-down into submissions by status
   - **Why hybrid**: Shows loading reference data alongside queries, mixing EntityDataGrid with custom RunView

---

---

## 🔧 Reference Material 1: React Runtime Architecture

### Key Concepts for Component Development

**Hook Availability:**
- React hooks are destructured and available globally in components
- Use `useState`, `useEffect`, `useMemo`, etc. directly (NOT `React.useState`)
- The runtime provides these in the component execution context

**Library Access:**
- Components access external libraries via global variables
- Example: `antd` library exposes `Table`, `Card`, `Button` components
- Use `unwrapLibraryComponents()` helper for library access

**Component Structure:**
```javascript
function MyComponent({
  utilities,      // MJ utilities (RunView, RunQuery, AI tools)
  styles,         // Generated styles object
  components,     // Registry of other components
  callbacks,      // Event handlers
  savedUserSettings,  // Persisted state
  onSaveUserSettings  // State persistence callback
}) {
  // Hook usage (no React. prefix needed)
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Data loading with RunQuery
  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await utilities.rq.RunQuery({
          QueryName: 'MyQuery',
          Params: {ParamName: value}
        });
        setData(result.Results);
      } catch (error) {
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [utilities]);

  return <div>...</div>;
}
```

**Data Access Patterns:**
- **RunQuery**: For SQL aggregation queries (returns Results array)
- **RunView**: For entity record loading (returns Results array + metadata)
- Both accessed via `utilities.rq.RunQuery()` and `utilities.rv.RunView()`

**Component Registration:**
- Components must be registered in `.components.json`
- Specify dependencies (libraries and other components)
- Define data requirements mode ('queries', 'views', or 'hybrid')

---

## 🗄️ Reference Material 2: Database Schemas and BaseViews

### 🔑 CRITICAL: BaseView Naming Convention

**MemberJunction automatically generates a BaseView for every entity table:**
- Pattern: `vw${PluralTableName}`
- Examples: `vwAccounts`, `vwContacts`, `vwInvoices`, `vwDeals`

**❗ ALWAYS use BaseViews in queries, NEVER query tables directly:**
```sql
-- ✅ CORRECT - Use BaseView with schema prefix
SELECT * FROM CRM.vwAccounts WHERE AccountType = 'Customer'

-- ❌ WRONG - Never query tables directly
SELECT * FROM CRM.Account WHERE AccountType = 'Customer'
```

**Schema Prefix is REQUIRED:**
- `CRM.vwAccounts` (not just `vwAccounts`)
- `Events.vwSubmissions` (not just `vwSubmissions`)
- `__mj.vwAIModels` (not just `vwAIModels`)

**BaseView Advantages:**
- Includes all base table columns
- Includes foreign key lookup fields (display names from related entities)
- Includes root ID fields for recursive relationships
- Automatically maintained by CodeGen

---

### CRM Schema BaseViews

| Entity Name | Base Table | BaseView | Primary Key |
|-------------|------------|----------|-------------|
| Accounts | CRM.Account | CRM.vwAccounts | ID (INT) |
| Contacts | CRM.Contact | CRM.vwContacts | ID (INT) |
| Activities | CRM.Activity | CRM.vwActivities | ID (INT) |
| Products | CRM.Product | CRM.vwProducts | ID (INT) |
| Deals | CRM.Deal | CRM.vwDeals | ID (INT) |
| Deal Products | CRM.DealProduct | CRM.vwDealProducts | ID (INT) |
| Invoices | CRM.Invoice | CRM.vwInvoices | ID (INT) |
| Invoice Line Items | CRM.InvoiceLineItem | CRM.vwInvoiceLineItems | ID (INT) |
| Payments | CRM.Payment | CRM.vwPayments | ID (INT) |
| Industries | CRM.Industry | CRM.vwIndustries | ID (INT) |
| Account Types | CRM.AccountType | CRM.vwAccountTypes | ID (INT) |
| Account Status | CRM.AccountStatus | CRM.vwAccountStatus | ID (INT) |
| Activity Types | CRM.ActivityType | CRM.vwActivityTypes | ID (INT) |
| Relationship Types | CRM.RelationshipType | CRM.vwRelationshipTypes | ID (INT) |
| Contact Relationships | CRM.ContactRelationship | CRM.vwContactRelationships | ID (INT) |
| Account Insights | CRM.AccountInsight | CRM.vwAccountInsights | ID (INT) |

**CRM.vwAccounts - Key Fields:**
- Base: ID, Name, Industry, AnnualRevenue, TickerSymbol, Exchange, EmployeeCount, Founded, Website, Phone, AccountType, AccountStatus, IsActive, BillingCity, BillingState, BillingCountry
- AccountType values: 'Prospect', 'Customer', 'Vendor', 'Partner', 'Competitor', 'Other'
- AccountStatus values: 'Active', 'Inactive', 'On Hold', 'Closed'

**CRM.vwContacts - Key Fields:**
- Base: ID, AccountID, FirstName, LastName, FullName, Title, Department, Email, Phone, Mobile, IsActive
- Lookup: Account (account name from FK)

**CRM.vwInvoices - Key Fields:**
- Base: ID, AccountID, InvoiceNumber, InvoiceDate, DueDate, Total, PaidAmount, Status
- Status values: 'Draft', 'Sent', 'Paid', 'Overdue', 'Canceled'
- Lookup: Account (account name from FK)
- Computed: Outstanding = (Total - PaidAmount)

**CRM.vwInvoiceLineItems - Key Fields:**
- Base: ID, InvoiceID, ProductID, Description, Quantity, UnitPrice, Total
- Lookup: Invoice (invoice number), Product (product name)

**CRM.vwDeals - Key Fields:**
- Base: ID, AccountID, Name, Value, Stage, Probability, Status, CloseDate, CreatedDate
- Stage values: 'Qualification', 'Needs Analysis', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'
- Lookup: Account (account name from FK)

**CRM.vwProducts - Key Fields:**
- Base: ID, Name, SKU, Category, UnitPrice, Description, IsActive

**CRM.vwPayments - Key Fields:**
- Base: ID, InvoiceID, PaymentDate, Amount, PaymentMethod, ReferenceNumber
- Lookup: Invoice (invoice number)

---

### Events Schema BaseViews

| Entity Name | Base Table | BaseView | Primary Key |
|-------------|------------|----------|-------------|
| Events | Events.Event | Events.vwEvents | ID (GUID) |
| Speakers | Events.Speaker | Events.vwSpeakers | ID (GUID) |
| Submissions | Events.Submission | Events.vwSubmissions | ID (GUID) |
| Submission Speakers | Events.SubmissionSpeaker | Events.vwSubmissionSpeakers | ID (GUID) |
| Submission Reviews | Events.SubmissionReview | Events.vwSubmissionReviews | ID (GUID) |
| Submission Notifications | Events.SubmissionNotification | Events.vwSubmissionNotifications | ID (GUID) |
| Event Review Tasks | Events.EventReviewTask | Events.vwEventReviewTasks | ID (GUID) |

**Events.vwEvents - Key Fields:**
- Base: ID, ParentID, Name, Description, ConferenceTheme, TargetAudience, StartDate, EndDate, Location, Status, SubmissionDeadline, NotificationDate, BaselinePassingScore, AccountID
- Status values: 'Planning', 'Open for Submissions', 'Review', 'Closed', 'Completed', 'Canceled'
- Lookup: Parent (parent event name), Account (account name)

**Events.vwSubmissions - Key Fields:**
- Base: ID, EventID, TypeformResponseID, SubmittedAt, Status, SubmissionTitle, SubmissionAbstract, SessionFormat, Duration, TargetAudienceLevel, AIEvaluationScore, PassedInitialScreening, FinalDecision
- Status values: 'New', 'Analyzing', 'Passed Initial', 'Failed Initial', 'Under Review', 'Accepted', 'Rejected', 'Waitlisted', 'Resubmitted'
- SessionFormat values: 'Workshop', 'Keynote', 'Panel', 'Lightning Talk', 'Tutorial', 'Presentation', 'Roundtable', 'Other'
- Lookup: Event (event name)

**Events.vwSpeakers - Key Fields:**
- Base: ID, ContactID, FullName, Email, PhoneNumber, Title, Organization, Bio, LinkedInURL, TwitterHandle, CredibilityScore, PublicationsCount, SocialMediaReach
- Lookup: Contact (contact name from CRM)

**Events.vwSubmissionReviews - Key Fields:**
- Base: ID, SubmissionID, ReviewerContactID, ReviewedAt, OverallScore, RelevanceScore, QualityScore, SpeakerExperienceScore, Comments, Recommendation
- Recommendation values: 'Accept', 'Reject', 'Waitlist', 'Needs Discussion'
- Lookup: Submission (submission title), Reviewer (reviewer name from CRM.Contact)

---

### MJ Core Schema BaseViews (for Component 3)

| Entity Name | Base Table | BaseView | Primary Key |
|-------------|------------|----------|-------------|
| AI Models | __mj.AIModel | __mj.vwAIModels | ID (GUID) |
| MJ: AI Prompt Runs | __mj.AIPromptRun | __mj.vwAIPromptRuns | ID (GUID) |
| AI Vendors | __mj.AIVendor | __mj.vwAIVendors | ID (GUID) |
| AI Prompts | __mj.AIPrompt | __mj.vwAIPrompts | ID (GUID) |

**Note:** MJ Core entities use GUID primary keys and many have the "MJ: " prefix in entity names (but NOT in table/view names).

**__mj.vwAIModels - Key Fields:**
- Base: ID, Name, VendorID, Description, MaxInputTokens, MaxOutputTokens, IsActive
- Lookup: Vendor (vendor name)

**__mj.vwAIPromptRuns - Key Fields:**
- Base: ID, PromptID, ModelID, InputTokens, OutputTokens, StartedAt, EndedAt, Success, ErrorMessage
- Lookup: Prompt (prompt name), Model (model name)

**__mj.vwAIVendors - Key Fields:**
- Base: ID, Name, Description, Website

---

## 📊 Reference Material 3: Query Templating

### Nunjucks Template Syntax for MJ Queries

**Template Parameters:**
```sql
-- Use {{ParamName}} for string interpolation
-- Use {{ParamName | sqlsafe}} for SQL-safe values
SELECT * FROM CRM.Account WHERE AccountType = '{{AccountType}}'
```

**MJ-Specific Keywords:**

1. **Schema Placeholder:** `${flyway:defaultSchema}` or `{{mj_core_schema}}`
   ```sql
   -- For MJ Core schema tables
   SELECT * FROM ${flyway:defaultSchema}.AIModel
   -- Or use template variable
   SELECT * FROM {{mj_core_schema}}.AIPromptRun
   ```

2. **Parameter Definitions in Query Metadata:**
   ```json
   "Params": [
     {
       "Name": "StartDate",
       "Type": "datetime",
       "DefaultValue": null,
       "IsRequired": false,
       "Description": "Filter start date"
     },
     {
       "Name": "AccountType",
       "Type": "nvarchar",
       "DefaultValue": "'Customer'",
       "IsRequired": false,
       "Description": "Account type filter"
     }
   ]
   ```

3. **Conditional SQL Blocks:**
   ```sql
   -- Use WHERE 1=1 pattern for optional filters
   SELECT * FROM CRM.Invoice
   WHERE 1=1
   {% if StartDate %}AND InvoiceDate >= '{{StartDate}}'{% endif %}
   {% if EndDate %}AND InvoiceDate <= '{{EndDate}}'{% endif %}
   ```

4. **Date Handling:**
   ```sql
   -- Use DATEADD for relative dates
   WHERE InvoiceDate >= DATEADD(month, -12, GETDATE())

   -- Use YEAR/MONTH functions for grouping
   GROUP BY YEAR(InvoiceDate), MONTH(InvoiceDate)
   ```

### Query Record Structure (.queries.json)

```json
{
  "fields": {
    "Name": "MonthlyInvoiceRevenue",
    "CategoryID": "@lookup:MJ: Query Categories.Name=CRM Analytics",
    "UserQuestion": "What is the monthly revenue from invoices?",
    "Description": "Aggregates invoice revenue by month",
    "SQL": "@file:SQL/monthly-invoice-revenue.sql",
    "TechnicalDescription": "Groups invoices by YEAR/MONTH and calculates SUM(Total), COUNT(*), AVG(Total)",
    "Status": "Approved",
    "QualityRank": 8,
    "ExecutionCostRank": 2,
    "UsesTemplate": true
  },
  "relatedEntities": {
    "Params": [
      {
        "Name": "Year",
        "Type": "int",
        "DefaultValue": null,
        "IsRequired": false,
        "Description": "Optional year filter"
      },
      {
        "Name": "MinRevenue",
        "Type": "decimal",
        "DefaultValue": "0",
        "IsRequired": false,
        "Description": "Minimum revenue filter"
      }
    ]
  },
  "primaryKey": {
    "ID": "GENERATE-NEW-GUID-HERE"
  },
  "sync": {
    "lastModified": "2025-12-03T00:00:00.000Z",
    "checksum": "will-be-calculated-by-mj-sync"
  }
}
```

**Key Points:**
- Use `@file:SQL/filename.sql` to reference external SQL files
- Use `@lookup:EntityName.FieldName=Value` for foreign key lookups
- Generate new GUIDs for primaryKey.ID
- Set UsesTemplate: true when using Nunjucks templates
- Params go in relatedEntities section

### SQL Query Examples Using BaseViews

**Example 1: Simple Aggregation (Monthly Revenue)**
```sql
-- Query: monthly-invoice-revenue.sql
-- Returns monthly invoice totals for paid invoices

SELECT
  YEAR(i.InvoiceDate) AS Year,
  MONTH(i.InvoiceDate) AS Month,
  DATENAME(month, i.InvoiceDate) AS MonthName,
  SUM(i.Total) AS TotalRevenue,
  COUNT(*) AS InvoiceCount,
  AVG(i.Total) AS AvgInvoice
FROM CRM.vwInvoices i
WHERE i.Status = 'Paid'
  {% if Year %}AND YEAR(i.InvoiceDate) = {{Year}}{% endif %}
GROUP BY YEAR(i.InvoiceDate), MONTH(i.InvoiceDate), DATENAME(month, i.InvoiceDate)
ORDER BY Year DESC, Month DESC
```

**Example 2: JOIN with Aggregation (Revenue by Account Type)**
```sql
-- Query: account-revenue-by-type.sql
-- Aggregates paid invoice revenue grouped by account type

SELECT
  a.AccountType,
  COUNT(DISTINCT a.ID) AS AccountCount,
  SUM(i.Total) AS TotalRevenue,
  AVG(i.Total) AS AvgInvoice,
  COUNT(i.ID) AS InvoiceCount
FROM CRM.vwAccounts a
INNER JOIN CRM.vwInvoices i ON i.AccountID = a.ID
WHERE i.Status = 'Paid'
  AND a.IsActive = 1
  {% if AccountType %}AND a.AccountType = '{{AccountType}}'{% endif %}
GROUP BY a.AccountType
ORDER BY TotalRevenue DESC
```

**Example 3: Multi-Table JOIN (Top Products by Revenue)**
```sql
-- Query: top-products-ranking.sql
-- Ranks products by total revenue from invoice line items

SELECT TOP {{TopN}}
  p.Name AS ProductName,
  p.Category,
  SUM(ili.Total) AS TotalRevenue,
  SUM(ili.Quantity) AS TotalQuantity,
  COUNT(DISTINCT ili.InvoiceID) AS InvoiceCount,
  AVG(ili.UnitPrice) AS AvgPrice
FROM CRM.vwProducts p
INNER JOIN CRM.vwInvoiceLineItems ili ON ili.ProductID = p.ID
INNER JOIN CRM.vwInvoices i ON i.ID = ili.InvoiceID
WHERE i.Status = 'Paid'
  AND p.IsActive = 1
  {% if Category %}AND p.Category = '{{Category}}'{% endif %}
  {% if StartDate %}AND i.InvoiceDate >= '{{StartDate}}'{% endif %}
  {% if EndDate %}AND i.InvoiceDate <= '{{EndDate}}'{% endif %}
GROUP BY p.Name, p.Category
ORDER BY TotalRevenue DESC
```

**Example 4: Computed Columns (Invoice Aging)**
```sql
-- Query: invoice-aging-analysis.sql
-- Analyzes outstanding invoices by aging buckets

SELECT
  CASE
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 30 THEN '0-30 days'
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 60 THEN '30-60 days'
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 90 THEN '60-90 days'
    ELSE '90+ days'
  END AS AgeBucket,
  COUNT(*) AS InvoiceCount,
  SUM(i.Total - i.PaidAmount) AS TotalOutstanding,
  AVG(DATEDIFF(day, i.DueDate, GETDATE())) AS AvgDaysOverdue
FROM CRM.vwInvoices i
WHERE i.Status != 'Paid'
  AND i.Status != 'Canceled'
  AND (i.Total - i.PaidAmount) > 0
  {% if MinOutstanding %}AND (i.Total - i.PaidAmount) >= {{MinOutstanding}}{% endif %}
GROUP BY
  CASE
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 30 THEN '0-30 days'
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 60 THEN '30-60 days'
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 90 THEN '60-90 days'
    ELSE '90+ days'
  END
ORDER BY
  CASE AgeBucket
    WHEN '0-30 days' THEN 1
    WHEN '30-60 days' THEN 2
    WHEN '60-90 days' THEN 3
    ELSE 4
  END
```

**Example 5: Time-Series Aggregation (Payment Trends)**
```sql
-- Query: payment-trends.sql
-- Monthly payment totals with average days to payment

SELECT
  YEAR(p.PaymentDate) AS Year,
  MONTH(p.PaymentDate) AS Month,
  DATENAME(month, p.PaymentDate) AS MonthName,
  COUNT(*) AS PaymentCount,
  SUM(p.Amount) AS TotalPaid,
  AVG(p.Amount) AS AvgPayment,
  AVG(DATEDIFF(day, i.InvoiceDate, p.PaymentDate)) AS AvgDaysToPayment
FROM CRM.vwPayments p
INNER JOIN CRM.vwInvoices i ON i.ID = p.InvoiceID
WHERE p.PaymentDate >= DATEADD(month, -{{MonthsBack}}, GETDATE())
GROUP BY YEAR(p.PaymentDate), MONTH(p.PaymentDate), DATENAME(month, p.PaymentDate)
ORDER BY Year DESC, Month DESC
```

**Example 6: Events Schema Query (Submission Status Summary)**
```sql
-- Query: submission-status-summary.sql
-- Aggregates submissions by status with speaker and review metrics

SELECT
  s.Status,
  COUNT(*) AS SubmissionCount,
  COUNT(DISTINCT ss.SpeakerID) AS UniqueSpeakers,
  AVG(s.AIEvaluationScore) AS AvgAIScore,
  COUNT(sr.ID) AS ReviewCount,
  AVG(sr.OverallScore) AS AvgReviewScore
FROM Events.vwSubmissions s
LEFT JOIN Events.vwSubmissionSpeakers ss ON ss.SubmissionID = s.ID
LEFT JOIN Events.vwSubmissionReviews sr ON sr.SubmissionID = s.ID
WHERE s.EventID = '{{EventID}}'
GROUP BY s.Status
ORDER BY
  CASE s.Status
    WHEN 'Accepted' THEN 1
    WHEN 'Under Review' THEN 2
    WHEN 'Passed Initial' THEN 3
    WHEN 'Waitlisted' THEN 4
    WHEN 'Rejected' THEN 5
    WHEN 'Failed Initial' THEN 6
    ELSE 7
  END
```

**Key Patterns:**
- Always use `Schema.vwViewName` format
- JOIN BaseViews, never tables
- Use aggregate functions: `SUM()`, `COUNT()`, `AVG()`, `MIN()`, `MAX()`
- Use `DATEDIFF()`, `DATEADD()`, `DATENAME()` for date operations
- Use `CASE` statements for bucketing/categorization
- Use Nunjucks `{% if ParamName %}` for optional filters
- Always include `WHERE 1=1` when using conditional filters
- Use `TOP {{ParamName}}` for configurable result limits

### 🚨 CRITICAL: Pre-Query Checklist (Prevents 90% of Errors)

**Before writing ANY query, ALWAYS:**

1. **Verify Exact Column Names** - Read the schema SQL file or grep for CREATE TABLE
   ```bash
   # Check exact field names
   grep -A 50 "CREATE TABLE CRM.Invoice" "SQL Scripts/demo/CRM Schema*.sql"
   ```
   - Common mistake: Assuming `Total` when it's actually `TotalAmount`
   - Common mistake: Assuming `Amount` when it's actually `PaidAmount`

2. **Check Valid Enum Values** - Find CHECK constraints in schema
   ```bash
   # Find status constraints
   grep "CHK.*Status" "SQL Scripts/demo/CRM Schema*.sql"
   ```
   - Invoice Status: 'Draft', 'Sent', 'Paid', 'Overdue', 'Canceled' (NOT 'Unpaid')

3. **Verify BaseView Exists** - Confirm the view will be generated
   ```bash
   # List existing views
   ls "SQL Scripts/generated/CRM/vw*.sql"
   ```

4. **Test Template Syntax** - Start simple, add complexity after validation
   - First query: No parameters or 1 simple parameter
   - Second query: Add optional filters
   - Third query: Add dynamic grouping

5. **Verify Entity Fields** - Only use fields that exist on the entity
   ```bash
   # Check Queries entity fields
   grep -A 5 "Entity Name='Queries'" "migrations/v2/*.sql"
   ```
   - Don't add custom fields like "Comments" that don't exist

### 🎯 Advanced Pattern: Dynamic Grouping with Multi-Value Parameters

**Use Case:** Allow single or multiple filter values with optional grouping

**Example:** StatusList parameter that supports:
- Single value: `'Paid'` → Filter only
- Multiple values: `'Paid,Sent'` → Filter AND group by Status

**Implementation (CRITICAL - Use `{%-` for proper newlines):**
```sql
SELECT
  YEAR(i.InvoiceDate) AS Year,
  MONTH(i.InvoiceDate) AS Month,
  {%- if StatusList and ',' in StatusList %}
  i.Status,
  {%- endif %}
  SUM(i.TotalAmount) AS TotalRevenue
FROM CRM.vwInvoices i
WHERE 1=1
  {%- if StatusList %}
    {%- if ',' in StatusList %}
  AND i.Status IN (
      SELECT TRIM(value)
      FROM STRING_SPLIT({{ StatusList | sqlString }}, ',')
  )
    {%- else %}
  AND i.Status = {{ StatusList | sqlString }}
    {%- endif %}
  {%- else %}
  AND i.Status = 'Paid'  -- Sensible default
  {%- endif %}
GROUP BY
  YEAR(i.InvoiceDate),
  MONTH(i.InvoiceDate)
  {%- if StatusList and ',' in StatusList %}
  ,i.Status
  {%- endif %}
```

**🚨 CRITICAL: Nunjucks Template Best Practices**

**Problem:** Nunjucks templates can eat newlines causing syntax errors like `2025GROUP BY`

**Solution: Use Same-Line Approach (RECOMMENDED)**
```sql
-- Put Nunjucks tag and SQL content on SAME line
{% if StatusList and ',' in StatusList %}  i.Status,
{% endif %}  SUM(i.TotalAmount) AS TotalRevenue
```

**Why This Works:**
- Newline is BEFORE the `{%`, so it's preserved
- Content after `%}` starts on same line
- No whitespace stripping needed

**Alternative: Whitespace Control (More Complex)**
```sql
-- Use {%- to strip whitespace, but harder to read
  {%- if StatusList %}
  AND i.Status = {{ StatusList | sqlString }}
  {%- endif %}
```

**Best Practice:**
1. ✅ Start simple: Put tags and SQL on same line
2. ✅ Ensure newline BEFORE each `{%` tag
3. ✅ Test with actual parameters before adding complexity
4. ❌ Don't use `{%-` until you understand whitespace control

**Benefits for AI Training:**
- Demonstrates dynamic query structure based on parameter content
- Shows conditional SELECT columns and GROUP BY clauses
- Illustrates comma-delimited list handling with STRING_SPLIT
- Provides intelligent defaults when parameters are omitted
- Makes queries more flexible and broadly applicable

**Why This Matters:**
These 17 queries will be used to train AI agents on templated SQL generation. Rich, flexible parameter handling teaches agents:
- How to create reusable, adaptable queries
- When to add/remove columns dynamically
- How to handle list parameters intelligently
- Proper use of defaults for common scenarios

---

## 🧩 Reference Material 4: Generic Component Examples

### SimpleChart Component

**Purpose:** Renders charts from aggregated data (bar, line, pie, area, doughnut)

**Usage Pattern:**
```javascript
const { SimpleChart } = components;

// Data must be pre-aggregated array of objects
const chartData = [
  {Category: 'Q1', Revenue: 50000, Count: 25},
  {Category: 'Q2', Revenue: 65000, Count: 32},
  {Category: 'Q3', Revenue: 72000, Count: 38}
];

<SimpleChart
  data={chartData}
  chartType="bar"  // 'bar' | 'line' | 'pie' | 'area' | 'doughnut'
  groupBy="Category"
  valueField="Revenue"
  title="Quarterly Revenue"
  showLegend={true}
  onDataPointClick={(segment) => {
    console.log('Clicked:', segment.label, segment.value);
  }}
  utilities={utilities}
  styles={styles}
/>
```

**Key Properties:**
- `data`: Array of aggregated objects
- `chartType`: Visual representation type
- `groupBy`: Field name for X-axis/categories
- `valueField`: Field name for Y-axis/values
- `onDataPointClick`: Event handler for chart segment clicks
- Returns: `{label: string, value: number, index: number}`

**When to Use:**
- Data is already aggregated (from RunQuery with GROUP BY)
- No drilldown needed
- Visualization only

**When NOT to Use:**
- With detail records (use SimpleDrilldownChart instead)
- When you need to drill into underlying records

### DataGrid Component

**Purpose:** Displays tabular data with sorting, filtering, pagination

**Usage Pattern:**
```javascript
const { DataGrid } = components;

// Data can be any array of objects
const gridData = [
  {ID: 1, Name: 'Product A', Price: 99.99, Category: 'Electronics'},
  {ID: 2, Name: 'Product B', Price: 149.99, Category: 'Electronics'}
];

<DataGrid
  data={gridData}
  entityName="Products"  // Optional, enables metadata-aware formatting
  entityPrimaryKeys={['ID']}  // Required for OpenEntityRecord
  columns={['Name', 'Category', 'Price']}  // Or array of ColumnDef objects
  sorting={true}
  paging={true}
  pageSize={20}
  filtering={true}
  selectionMode="none"  // 'none' | 'checkbox' | 'radio'
  onRowClick={(record) => console.log('Clicked row:', record)}
  utilities={utilities}
  styles={styles}
  callbacks={callbacks}
/>
```

**Key Properties:**
- `data`: Array of any objects (not necessarily entities)
- `columns`: Array of field names OR ColumnDef objects
- `entityName`: Optional, provides metadata-aware formatting
- `entityPrimaryKeys`: Required if using OpenEntityRecord
- `onRowClick`: Custom row click handler

**When to Use:**
- Displaying query results (aggregated data)
- Showing data that doesn't map to a single entity
- Custom data structures

### EntityDataGrid Component

**Purpose:** DataGrid specifically for MJ entity records with automatic loading

**Usage Pattern:**
```javascript
const { EntityDataGrid } = components;

<EntityDataGrid
  entityName="Invoices"
  extraFilter="Status='Paid' AND AccountID IN (SELECT ID FROM CRM.Account WHERE AccountType='Customer')"
  fields={['InvoiceNumber', 'InvoiceDate', 'Total', 'Status']}
  orderBy="InvoiceDate DESC"
  pageSize={50}
  maxCachedRows={1000}  // Adaptive caching threshold
  enableSorting={true}
  enableFiltering={true}
  showRefreshButton={true}
  onCacheModeChanged={(info) => console.log('Cache mode:', info.cacheMode)}
  utilities={utilities}
  styles={styles}
  components={components}
  callbacks={callbacks}
/>
```

**Key Properties:**
- `entityName`: MJ entity name (uses RunView internally)
- `extraFilter`: SQL WHERE clause (without WHERE keyword)
- `fields`: Array of field names OR ColumnDef objects
- `maxCachedRows`: Threshold for full vs partial caching
- `onCacheModeChanged`: Event when cache strategy changes

**Adaptive Caching:**
- **Full Cache Mode**: totalRecords ≤ maxCachedRows
  - Loads all data once
  - Instant client-side operations

- **Partial Cache Mode**: totalRecords > maxCachedRows
  - Server-side operations
  - Caches up to maxCachedRows for searching
  - Progressive page caching

**When to Use:**
- Loading entity records with filtering
- Need automatic pagination and caching
- Want metadata-aware formatting
- Need OpenEntityRecord integration

**When NOT to Use:**
- With pre-aggregated query results (use DataGrid)
- Data doesn't correspond to an entity
- Need custom data loading logic

---

## 🧪 Reference Material 5: Component Testing

### Testing Individual Components

**Location:** Tests are in `packages/React/component-linter-tests/`

**Test Individual Component:**
```bash
cd packages/React/component-linter-tests
npm run test:component -- --componentName="MonthlyInvoiceRevenue"
```

**Test All Components:**
```bash
npm test
```

**Common Linting Rules:**
- `no-import-statements`: No ES6 imports allowed
- `no-export-statements`: No exports from components
- `no-require-statements`: No require() or dynamic imports
- `component-not-in-dependencies`: All referenced components must be in dependencies
- `validate-component-references`: Referenced components must exist
- `no-direct-state-mutation`: No direct state mutations
- `missing-data-requirements`: dataRequirements must match actual data access
- `missing-utilities`: Components must declare utilities in parameters

**Fix Process:**
1. Run linter on component
2. Review violations and fix suggestions
3. Fix code violations
4. Re-run linter until clean
5. Test in UI

---

## 📁 Directory Structure for New Queries

### Create This Structure:

```
SQL Scripts/demo/
├── metadata/
│   ├── .mj-sync.json              # Copy from /metadata/.mj-sync.json
│   └── queries/
│       ├── .mj-sync.json          # Copy from /metadata/queries/.mj-sync.json
│       ├── .queries.json          # Query records array
│       └── SQL/
│           ├── monthly-invoice-revenue.sql
│           ├── top-products-ranking.sql
│           ├── ai-model-analytics-models.sql
│           ├── ai-model-analytics-costs.sql
│           ├── ai-model-analytics-trends.sql
│           ├── account-revenue-by-type.sql
│           ├── category-totals.sql
│           ├── category-top-products.sql
│           ├── submission-status-summary.sql
│           ├── submission-review-timeline.sql
│           ├── deal-pipeline-distribution.sql
│           ├── deal-velocity-analysis.sql
│           ├── deal-stage-trends.sql
│           ├── invoice-aging-analysis.sql
│           ├── payment-trends.sql
│           ├── top-accounts-by-outstanding.sql
│           └── account-payment-history.sql
```

### .mj-sync.json Configuration:

Copy from `/metadata/.mj-sync.json` and `/metadata/queries/.mj-sync.json`:

```json
{
  "entityName": "Queries",
  "recordsFile": ".queries.json",
  "mode": "push-only",
  "includeRelatedEntities": true
}
```

---

## 🎯 Implementation Steps for New Claude Instance

### Query Complexity Guidelines

**Incremental Complexity Approach:**

**Level 1: Simple Queries (Do First)**
- No parameters OR 1 simple optional parameter
- No dynamic columns
- Simple aggregation: `SUM()`, `COUNT()`, `AVG()`
- Use for validation and learning patterns

**Example:**
```sql
SELECT
  YEAR(i.InvoiceDate) AS Year,
  SUM(i.TotalAmount) AS TotalRevenue
FROM CRM.vwInvoices i
WHERE i.Status = 'Paid'
{% if Year %}  AND YEAR(i.InvoiceDate) = {{ Year | sqlNumber }}
{% endif %}GROUP BY YEAR(i.InvoiceDate)
```

**Level 2: Intermediate Queries**
- 2-3 optional parameters
- Multiple filter combinations
- Multi-table JOINs
- Use after validating Level 1 patterns

**Level 3: Advanced Queries**
- List parameters with STRING_SPLIT
- Dynamic column injection
- Conditional GROUP BY
- Use after validating Levels 1-2

**Recommendation:** Build 2-3 Level 1 queries first, validate they work, THEN add complexity.

---

## 📁 Complete File Reference

### ✅ Component 1: MonthlyInvoiceRevenue (COMPLETE)

**SQL Query:**
- ✅ `/SQL Scripts/demo/metadata/queries/SQL/monthly-invoice-revenue.sql` - Implemented with dynamic grouping

**Query Metadata:**
- ✅ `/SQL Scripts/demo/metadata/queries/.queries.json` - Entry with UUID `A0B4C65A-8AB0-43B3-A800-6A4F89248487`

**Component Files:**
- ✅ `/metadata/components/spec/query-examples/monthly-invoice-revenue.spec.json` - Complete with all properties
- ✅ `/metadata/components/code/query-examples/monthly-invoice-revenue.js` - Fully implemented
- ✅ `/metadata/components/.components.json` - Registered with UUID `F8A3B5C7-9D2E-4F1A-B6E8-1C4D7A9E2F5B`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/monthly-invoice-revenue.json`

**Status:** ✅ **COMPLETE** - Zero linter violations, ready for UI testing

---

### 🚧 Component 2: TopProductsRanking (TODO) - **HYBRID MODE**

**Data Pattern:** Simple Hybrid - RunQuery + Manual RunView Drill-Down
- RunQuery for aggregated product rankings
- Direct RunView call when user clicks a product
- Display invoice line item details in standard DataGrid (NOT EntityDataGrid)
- Demonstrates full control over drill-down behavior and data transformation

**SQL Query:**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/top-products-ranking.sql` - Placeholder, needs implementation

**Query Metadata:**
- ✅ `/SQL Scripts/demo/metadata/queries/.queries.json` - Entry with UUID `34717B11-B31E-4B60-B0A5-D70EA7DA133E`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/top-products-ranking.spec.json` - Shell created, **SET MODE: "hybrid"**
- 📝 `/metadata/components/code/query-examples/top-products-ranking.js` - Placeholder, needs implementation
- ✅ `/metadata/components/.components.json` - Registered with UUID `4F26C3DC-A14F-4F01-8F77-7BFFFBA0E2EA`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/top-products-ranking.json`

**Namespace:** `CRM/Sales` | **Type:** Table

**Implementation Notes:**
- State: `topProducts` (from query), `selectedProduct` (ID), `productDetails` (from RunView)
- On product click: Call `utilities.rv.RunView()` with `EntityName: 'Invoice Line Items'` and `ExtraFilter: ProductID='...'`
- Render: Top products table + collapsible detail panel with DataGrid
- Dependencies: DataGrid (not EntityDataGrid)

---

### 🚧 Component 3: AIModelAnalyticsDashboard (TODO)

**SQL Queries (3 queries for this dashboard):**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/ai-model-analytics-models.sql` - UUID `0B20BDAC-44C8-409D-9674-3638D026C546`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/ai-model-analytics-costs.sql` - UUID `60C85609-7AFE-4F55-BBD3-8F6F72EA28F5`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/ai-model-analytics-trends.sql` - UUID `BA2504F8-F23A-4BFF-B72E-DFE161836715`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/a-i-model-analytics-dashboard.spec.json` - Shell created
- 📝 `/metadata/components/code/query-examples/a-i-model-analytics-dashboard.js` - Placeholder
- ✅ `/metadata/components/.components.json` - Registered with UUID `65FADF22-87D3-4DC1-8B0D-034A683235A1`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/ai-model-analytics-dashboard.json`

**Namespace:** `AI/Analytics` | **Type:** Dashboard

---

### 🚧 Component 4: AccountRevenueByType (TODO)

**SQL Query:**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/account-revenue-by-type.sql` - UUID `34337D1E-F592-4DBD-BAF3-6D36BF95D029`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/account-revenue-by-type.spec.json` - Shell created
- 📝 `/metadata/components/code/query-examples/account-revenue-by-type.js` - Placeholder
- ✅ `/metadata/components/.components.json` - Registered with UUID `A54ADC99-B1B4-4C36-8D23-3A85411E8065`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/account-revenue-by-type.json`

**Namespace:** `CRM/Analytics` | **Type:** Chart

---

### 🚧 Component 5: ProductCategoryAnalysis (TODO)

**SQL Queries (2 queries for this dashboard):**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/category-totals.sql` - UUID `26B5D1D3-EAF7-4223-A015-C84B3B9F3EBC`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/category-top-products.sql` - UUID `E38EA2FC-7340-4560-81BE-032C248FA90F`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/product-category-analysis.spec.json` - Shell created
- 📝 `/metadata/components/code/query-examples/product-category-analysis.js` - Placeholder
- ✅ `/metadata/components/.components.json` - Registered with UUID `54239C9B-2BEC-4E5E-AB5E-5CA2104B0F2D`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/product-category-analysis.json`

**Namespace:** `CRM/Sales` | **Type:** Dashboard

---

### 🚧 Component 6: SubmissionReviewDashboard (TODO) - **HYBRID MODE**

**Data Pattern:** Complex Hybrid - Multiple RunQuery + RunView + EntityDataGrid
- RunQuery #1: Submission status summary (pie/bar chart)
- RunQuery #2: Review timeline (line chart showing reviews over time)
- RunView: Load top reviewers with custom aggregation/stats (not available via query)
- EntityDataGrid: Click chart segment to drill into submissions with that status
- Demonstrates mixing multiple data sources and drill-down patterns

**SQL Queries (2 queries for this dashboard):**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/submission-status-summary.sql` - UUID `3715933B-D7FA-4F7B-B998-4B38558F842D`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/submission-review-timeline.sql` - UUID `01E63704-71DE-4B7A-8677-F943F25BDB4D`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/submission-review-dashboard.spec.json` - Shell created, **SET MODE: "hybrid"**
- 📝 `/metadata/components/code/query-examples/submission-review-dashboard.js` - Placeholder
- ✅ `/metadata/components/.components.json` - Registered with UUID `1A005DA0-2587-4EB8-8E93-B8EF242696D0`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/submission-review-dashboard.json`

**Namespace:** `Events/Reports` | **Type:** Dashboard

**Implementation Notes:**
- State: `statusSummary` (query 1), `timeline` (query 2), `topReviewers` (RunView), `selectedStatus` (for EntityDataGrid filter)
- RunView for reviewers: `EntityName: 'Submission Reviews'`, aggregate client-side or use custom ExtraFilter
- Layout: 2 charts (top) + Top Reviewers list (sidebar) + EntityDataGrid (bottom, conditionally shown on chart click)
- Dependencies: SimpleChart, EntityDataGrid
- dataRequirements.entities: Must include "Submissions" for EntityDataGrid drill-down

---

### 🚧 Component 7: DealPipelineVisualization (TODO)

**SQL Queries (3 queries for this dashboard):**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/deal-pipeline-distribution.sql` - UUID `685C3459-7EC6-4F31-890E-CEBEC84B7169`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/deal-velocity-analysis.sql` - UUID `D670D307-1CC5-4787-9B13-E07CBD02A460`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/deal-stage-trends.sql` - UUID `84023D57-EA5F-4DCB-BB2D-0527FA447E85`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/deal-pipeline-visualization.spec.json` - Shell created
- 📝 `/metadata/components/code/query-examples/deal-pipeline-visualization.js` - Placeholder
- ✅ `/metadata/components/.components.json` - Registered with UUID `C3D72934-DA09-426C-BCEB-2EF5B6170234`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/deal-pipeline-visualization.json`

**Namespace:** `CRM/Sales` | **Type:** Dashboard

---

### 🚧 Component 8: InvoiceAgingAnalysis (TODO)

**SQL Queries (4 queries for this dashboard):**
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/invoice-aging-analysis.sql` - UUID `637EFD6E-B12D-479E-A118-D942B9AFE02F`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/payment-trends.sql` - UUID `12BA2A5F-7B66-45EA-9ECA-072938354648`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/top-accounts-by-outstanding.sql` - UUID `8DB86E60-40BF-4F62-A941-7E57A5832ECE`
- 📝 `/SQL Scripts/demo/metadata/queries/SQL/account-payment-history.sql` - UUID `80B2F4FF-4F2F-4942-8317-00549AC09A0F`

**Component Files:**
- 📝 `/metadata/components/spec/query-examples/invoice-aging-analysis.spec.json` - Shell created
- 📝 `/metadata/components/code/query-examples/invoice-aging-analysis.js` - Placeholder
- ✅ `/metadata/components/.components.json` - Registered with UUID `25F9FC00-115C-4862-A2C1-6126C10EA815`

**Test Fixture:**
- ✅ `/packages/React/component-linter-tests/fixtures/valid-components/invoice-aging-analysis.json`

**Namespace:** `CRM/Finance` | **Type:** Dashboard

---

## 📚 Complete Component Designs

These 8 components demonstrate proper data loading patterns, progressing from simple queries-only components to complex hybrid patterns.

---

## Section 1: RunQuery-Only Components (queries mode)

These components perform all aggregation at the SQL Server level and render visualizations without drilldown capability.

### Component 1: Monthly Invoice Revenue Chart

**Complexity**: ⭐ Simple

**Purpose**: Teach basic SQL aggregation with GROUP BY for time-series data

**Schema**: CRM

**Data Pattern**:
- Single RunQuery executes SQL with `GROUP BY YEAR(InvoiceDate), MONTH(InvoiceDate)`
- Query calculates `SUM(Total)`, `COUNT(*)`, `AVG(Total)` per month
- Returns 12-24 rows (1-2 years of monthly aggregates)

**Component Structure**:
```
[RunQuery: Monthly Invoice Aggregation]
          ↓
[Transform: Add MonthName labels]
          ↓
[SimpleChart: Bar chart, groupBy=MonthName, valueField=TotalRevenue]
```

**Key Learning**:
- Pre-aggregated data uses SimpleChart, NOT SimpleDrilldownChart
- SQL aggregation scales to millions of invoices without performance issues
- Minimal data transfer (12 rows vs 100K+ invoice records)

**Props**:
- `year`: Optional filter for specific year
- `chartType`: 'bar' | 'line' | 'area'

**No Drilldown**: Users can see monthly totals but cannot click to see individual invoices

**Status**: ✅ **COMPLETE** - Fully implemented and tested

---

### Component 2: Top 10 Products by Revenue Ranking

**Complexity**: ⭐⭐ Medium

**Purpose**: Teach SQL ranking with TOP N and multi-table JOINs

**Schema**: CRM

**Data Pattern**:
- Single RunQuery with `TOP 10` clause
- JOINs InvoiceLineItem → Product → Product Category
- Groups by Product, calculates total revenue and order count
- `ORDER BY TotalRevenue DESC` for ranking

**Component Structure**:
```
[RunQuery: Top Products Ranking]
          ↓
[Transform: Format currency, add rank numbers]
          ↓
[SimpleChart: Horizontal bar chart showing top 10 products]
```

**Key Learning**:
- Database-level ranking is faster than loading all records and sorting client-side
- TOP N queries with proper indexes are extremely efficient
- Shows how to include multiple aggregations (SUM revenue, COUNT orders)

**Props**:
- `topN`: Number of products to show (default 10)
- `category`: Optional filter to show top products in specific category
- `dateRange`: Optional filter for date range

**No Drilldown**: Shows top performers but doesn't allow clicking to see underlying orders

**Status**: 📝 TODO

---

### Component 3: AI Model Usage Analytics Dashboard

**Complexity**: ⭐⭐⭐ Complex

**Purpose**: Teach multi-query coordination and KPI calculations

**Schema**: MJ

**Data Pattern**:
- **Three separate RunQuery calls** executed in parallel:
  1. Model usage counts: `GROUP BY ModelName` with `COUNT(*)` from AI Prompt Runs
  2. Cost analysis: `SUM(InputTokens * InputCostPerToken)` grouped by vendor
  3. Time-based trends: Daily usage counts for last 30 days
- All queries execute concurrently using `Promise.all()`
- Results combined into unified dashboard view

**Component Structure**:
```
[RunQuery 1: Model Counts] ────┐
[RunQuery 2: Cost Analysis] ───┼──→ [Combine Results] ──→ [Multi-Panel Dashboard]
[RunQuery 3: Usage Trends]  ────┘                              ├─ KPI Cards (totals)
                                                                ├─ Pie Chart (model distribution)
                                                                ├─ Bar Chart (cost by vendor)
                                                                └─ Line Chart (usage trends)
```

**Key Learning**:
- How to coordinate multiple independent queries efficiently
- Parallel execution with Promise.all() for performance
- Combining multiple query results into cohesive dashboard
- Using different chart types for different data dimensions

**Props**:
- `dateRange`: Filter for time period (default: last 30 days)
- `vendorFilter`: Optional filter for specific AI vendor
- `refreshInterval`: Auto-refresh interval in seconds

**No Drilldown**: Dashboard shows analytics but doesn't drill into individual prompt runs

**Status**: 📝 TODO

---

## Section 2: Hybrid Mode Components (queries + views)

These components use RunQuery for aggregation and EntityDataGrid (or filtered RunView) for drilldown into detail records.

### Component 4: Account Revenue by Type Analysis (SIMPLE HYBRID)

**Complexity**: ⭐ Simple Hybrid

**Purpose**: Teach the fundamental hybrid pattern - aggregated chart with entity record drilldown

**Schema**: CRM

**Data Pattern**:
- **RunQuery**: Aggregates total revenue by AccountType
  - SQL: `SELECT at.Name AS AccountType, COUNT(DISTINCT a.ID) AS AccountCount, SUM(i.Total) AS TotalRevenue FROM Account a JOIN AccountType at ON a.AccountTypeID = at.ID JOIN Invoice i ON i.AccountID = a.ID WHERE i.Status = 'Paid' GROUP BY at.Name`
  - Returns: ~5-10 rows (one per account type)
- **EntityDataGrid**: Shows filtered invoices for clicked account type
  - Triggered when user clicks chart segment
  - Filter: `AccountID IN (SELECT ID FROM CRM.Account WHERE AccountTypeID = '{selectedTypeId}')`
  - Shows invoice details with pagination

**Component Structure**:
```
[RunQuery: Revenue by Account Type]
          ↓
[SimpleChart: Pie chart, onClick sets selectedAccountType]
          ↓
   User clicks segment
          ↓
[EntityDataGrid: entityName="Invoices", filter="AccountID IN (...)"]
   - Loads paginated invoice records
   - Shows InvoiceNumber, Date, Total, Status
   - Supports sorting, filtering, OpenEntityRecord
```

**Key Learning**:
- **Core hybrid pattern**: RunQuery for chart + EntityDataGrid for drilldown
- Why SimpleDrilldownChart won't work (no detail records in aggregated data)
- How to build SQL filter from chart segment selection
- EntityDataGrid handles pagination automatically

**User Flow**:
1. View pie chart showing revenue breakdown by account type
2. Click "Enterprise" segment → Chart highlights selection
3. EntityDataGrid appears below showing all Enterprise account invoices
4. User can page through invoices, sort, search, click to open records
5. Click different segment or "Clear" → Grid updates with new filter

**Props**:
- `chartType`: 'pie' | 'doughnut' | 'bar'
- `showAccountCount`: Display account count in segment labels
- `gridPageSize`: Page size for drilldown grid (default 20)

**Status**: 📝 TODO

---

### Component 5: Product Category Performance Dashboard (MODERATE HYBRID)

**Complexity**: ⭐⭐ Moderate Hybrid

**Purpose**: Teach multiple aggregation dimensions with dual drilldown paths

**Schema**: CRM

**Data Pattern**:
- **RunQuery 1**: Category totals
  - `SELECT CategoryName, SUM(Revenue) AS TotalRevenue, COUNT(DISTINCT ProductID) AS ProductCount, AVG(Revenue) AS AvgRevenue FROM vw_ProductSales GROUP BY CategoryName`
  - Returns: ~10-15 category summary rows
- **RunQuery 2**: Top products within selected category (conditional)
  - Executes when category is selected
  - `SELECT TOP 5 ProductName, Revenue FROM vw_ProductSales WHERE Category = @SelectedCategory ORDER BY Revenue DESC`
- **EntityDataGrid 1**: Invoice line items for selected category
  - Shows which orders included products from this category
  - Filter: `ProductID IN (SELECT ID FROM Product WHERE Category = '{selected}')`
- **EntityDataGrid 2**: Invoice line items for selected product (nested drilldown)
  - Appears when user clicks specific product from top 5 list
  - Filter: `ProductID = '{selectedProductId}'`

**Component Structure**:
```
[RunQuery 1: Category Totals] → [SimpleChart: Bar chart of categories]
                                         ↓ onClick category
                                    ┌────┴────┐
                                    ↓         ↓
             [RunQuery 2: Top 5 Products]  [EntityDataGrid 1: Category line items]
                        ↓ onClick product
             [EntityDataGrid 2: Product line items]
```

**Key Learning**:
- Coordinating multiple queries that depend on user interaction
- Progressive disclosure: Category → Products → Line Items
- Managing state for multi-level selections
- Conditional query execution (RunQuery 2 only runs when category selected)

**User Flow**:
1. View bar chart of revenue by product category
2. Click "Electronics" → Two panels appear:
   - Left: Top 5 products in Electronics category
   - Right: All invoice line items for Electronics products
3. Click "Laptop Pro" in top products → Right grid filters to just Laptop Pro line items
4. Click "Back to Category" → Returns to all Electronics line items

**Props**:
- `showTopProducts`: Enable/disable top products panel
- `topProductCount`: How many top products to show (default 5)
- `includeProductDrilldown`: Enable nested product-level drilldown

**Status**: ✅ COMPLETED

### Review Notes

**Issue Discovered**: EntityDataGrid drill-down failing with SQL error "Invalid column name 'InvoiceDate'"

**Root Cause**: Component was referencing fields that don't exist in `vwInvoiceLineItems` base view:
- Used `InvoiceDate` (doesn't exist - only `InvoiceID` foreign key exists)
- Used `ProductName` (actual field is `Product`)
- Used `Total` (actual field is `TotalPrice`)
- Used `AccountName` (doesn't exist in line items view)

**Schema Validation Process Applied**:
```bash
sqlcmd -S sqlserver.local,1433 -d mj_test_2 -U MJ_CodeGen -P '...' \
  -Q "SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA='CRM' AND TABLE_NAME='vwInvoiceLineItems'
      ORDER BY COLUMN_NAME"
```

**Actual vwInvoiceLineItems Columns**:
- ID, InvoiceID (FK), ProductID (FK), Product (lookup), Quantity, UnitPrice, TotalPrice, Discount, Description
- __mj_CreatedAt, __mj_UpdatedAt

**Solution Applied**:
1. Fixed EntityDataGrid columns array to use: `Product`, `Quantity`, `UnitPrice`, `TotalPrice`, `Description`
2. Removed date filters - InvoiceDate doesn't exist in line items view
3. Changed orderBy from `InvoiceDate DESC` to `ID DESC` (most recent line items first)
4. Fixed row click handler to use correct field names
5. Added comment explaining why date filtering isn't possible

**Key Lesson**: **Always verify actual column names** in the base view before using in EntityDataGrid. Line items tables typically don't have denormalized date columns - they only have foreign keys to parent tables.

**Files Modified**:
- [product-category-analysis.js](metadata/components/code/query-examples/product-category-analysis.js)

**Testing**: ✅ Component now loads line item drill-down without errors

---

### Component 6: Event Submission Status Tracker (ADVANCED HYBRID)

**Complexity**: ⭐⭐⭐ Advanced Hybrid

**Purpose**: Teach complex aggregations with multi-faceted filtering and cross-entity drilldown

**Schema**: Events

**Data Pattern**:
- **RunQuery 1**: Submission status summary with speaker counts
  - `SELECT SubmissionStatus, COUNT(*) AS SubmissionCount, COUNT(DISTINCT SpeakerID) AS UniqueSpeakers, AVG(ReviewScore) AS AvgScore FROM vw_SubmissionDetails GROUP BY SubmissionStatus`
  - Returns: 5-8 status categories (Pending, Under Review, Accepted, Rejected, etc.)
- **RunQuery 2**: Review activity timeline (conditional)
  - Executes when status segment clicked
  - `SELECT CAST(ReviewDate AS DATE) AS Date, COUNT(*) AS ReviewCount, AVG(Score) AS AvgScore FROM SubmissionReview WHERE SubmissionID IN (SELECT ID FROM Submission WHERE Status = @Status) GROUP BY CAST(ReviewDate AS DATE) ORDER BY Date`
- **EntityDataGrid 1**: Submissions list for selected status
  - Entity: "Submissions"
  - Filter: `Status = '{selectedStatus}'`
  - Columns: Title, Speaker, SubmittedDate, ReviewScore, ReviewCount
- **EntityDataGrid 2**: Reviews for selected submission (appears on row click)
  - Entity: "Submission Reviews"
  - Filter: `SubmissionID = '{selectedSubmissionId}'`
  - Columns: Reviewer, Score, Comments, ReviewDate

**Component Structure**:
```
[RunQuery 1: Status Summary] → [Stacked Bar Chart: Submissions by Status]
                                         ↓ onClick status
                    ┌────────────────────┼────────────────────┐
                    ↓                    ↓                    ↓
    [KPI Cards: Counts/Averages]  [RunQuery 2: Timeline]  [EntityDataGrid 1: Submissions]
                                         ↓                          ↓ onRowClick
                                 [Line Chart: Activity]    [EntityDataGrid 2: Reviews]
```

**Key Learning**:
- Multi-panel layouts with coordinated state management
- Mixing KPI cards, charts, and grids in one component
- Master-detail-detail pattern (Status → Submission → Reviews)
- Using row click events to trigger nested drilldowns
- Displaying related entity records from different tables

**User Flow**:
1. View stacked bar chart showing submission counts by status
2. Click "Under Review" bar → Dashboard updates to show:
   - Top: KPI cards (total submissions, avg score, unique speakers)
   - Middle left: Line chart of review activity over time
   - Middle right: Grid of submissions currently under review
3. Click row in submissions grid → Bottom panel appears with all reviews for that submission
4. User can see reviewer comments, scores, and dates
5. Click another status or "Clear" → All panels update accordingly

**Props**:
- `showTimeline`: Display review activity timeline (default true)
- `showKPIs`: Display KPI cards (default true)
- `defaultStatus`: Pre-select a status on load
- `submissionGridPageSize`: Page size for submissions grid

**Status**: 📝 TODO

---

### Component 7: Deal Pipeline Velocity Analyzer (EXPERT HYBRID)

**Complexity**: ⭐⭐⭐⭐ Expert Hybrid

**Purpose**: Teach complex time-based analytics with stage transitions and multiple aggregation methods

**Schema**: CRM

**Data Pattern**:
- **RunQuery 1**: Current pipeline distribution
  - `SELECT Stage, COUNT(*) AS DealCount, SUM(Value) AS TotalValue, AVG(Value) AS AvgDealSize, AVG(DATEDIFF(day, CreatedDate, GETDATE())) AS AvgDaysInStage FROM Deal WHERE Status = 'Active' GROUP BY Stage ORDER BY StageOrder`
  - Returns: 5-7 pipeline stages with metrics
- **RunQuery 2**: Stage velocity analysis
  - `SELECT FromStage, ToStage, AVG(DATEDIFF(day, TransitionDate, PreviousDate)) AS AvgDaysToTransition, COUNT(*) AS TransitionCount FROM vw_DealStageHistory GROUP BY FromStage, ToStage`
  - Shows average time to move between stages
- **RunQuery 3**: Trend analysis (conditional)
  - Executes when stage selected
  - `SELECT CAST(CreatedDate AS DATE) AS Date, COUNT(*) AS DealsEntered, SUM(Value) AS ValueEntered FROM Deal WHERE Stage = @Stage GROUP BY CAST(CreatedDate AS DATE) ORDER BY Date DESC`
  - Last 90 days of deals entering selected stage
- **EntityDataGrid 1**: Deals in selected stage
  - Entity: "Deals"
  - Filter: `Stage = '{selectedStage}' AND Status = 'Active'`
  - Columns: DealName, Account, Value, Probability, DaysInStage, NextAction
  - Custom column with calculated DaysInStage using SQL DATEDIFF
- **EntityDataGrid 2**: Deal products (appears on deal row click)
  - Entity: "Deal Products"
  - Filter: `DealID = '{selectedDealId}'`
  - Shows products/services included in the deal

**Component Structure**:
```
[RunQuery 1: Pipeline Distribution] ──→ [Funnel Chart: Deals by Stage]
[RunQuery 2: Velocity Matrix] ────────→ [Heatmap: Stage Transition Times]
                                                   ↓ onClick stage
                            ┌──────────────────────┼──────────────────────┐
                            ↓                      ↓                      ↓
                    [KPI Panel: Stage Metrics]  [RunQuery 3: Trends]  [EntityDataGrid 1: Deals]
                            ↓                      ↓                      ↓ onRowClick
                    [Metric Cards Display]  [Line Chart: Entry Trends]  [EntityDataGrid 2: Products]
```

**Key Learning**:
- Complex multi-query coordination with different visualization types
- Calculated fields in EntityDataGrid columns (DaysInStage)
- Funnel and heatmap visualizations from query data
- Time-based trend analysis triggered by user selection
- Deep drilldown paths (Stage → Deal → Products)

**User Flow**:
1. View dual-panel dashboard:
   - Left: Funnel chart showing pipeline stages (wider = more deals)
   - Right: Heatmap showing average days to transition between stages
2. Click "Proposal" stage in funnel → Interface updates:
   - Top KPIs: Total value, deal count, avg days in stage for Proposal
   - Middle: Line chart showing deals entering Proposal stage over last 90 days
   - Bottom: Grid of all active deals currently in Proposal stage
3. Click specific deal row → Deal products panel slides in from right
4. User sees all products/line items for that deal with pricing
5. Can click deal to open full record via OpenEntityRecord
6. Select different stage or clear to reset view

**Props**:
- `includeVelocityHeatmap`: Show stage transition analysis (default true)
- `trendPeriodDays`: Days of historical trend data (default 90)
- `stageOrder`: Custom stage ordering if not using default
- `highlightSlowDeals`: Highlight deals exceeding avg time in stage

**Status**: 📝 TODO

---

### Component 8: Invoice Payment Status Dashboard (MASTER HYBRID)

**Complexity**: ⭐⭐⭐⭐⭐ Master Hybrid

**Purpose**: Teach the most complex hybrid pattern with multiple entities, time dimensions, and interactive filters

**Schema**: CRM

**Data Pattern**:
- **RunQuery 1**: Invoice aging analysis
  - `SELECT AgeBucket, SUM(Outstanding) AS TotalOutstanding, COUNT(*) AS InvoiceCount, AVG(DaysOverdue) AS AvgDaysOverdue FROM (SELECT CASE WHEN DaysOverdue < 30 THEN '0-30 days' WHEN DaysOverdue < 60 THEN '30-60 days' WHEN DaysOverdue < 90 THEN '60-90 days' ELSE '90+ days' END AS AgeBucket, (Total - PaidAmount) AS Outstanding, DATEDIFF(day, DueDate, GETDATE()) AS DaysOverdue FROM vw_InvoicePayments WHERE Status != 'Paid') AS Aged GROUP BY AgeBucket`
  - Returns: 4 aging buckets with totals
- **RunQuery 2**: Payment trends over time
  - `SELECT YEAR(PaymentDate) AS Year, MONTH(PaymentDate) AS Month, SUM(Amount) AS TotalPaid, COUNT(*) AS PaymentCount, AVG(DATEDIFF(day, InvoiceDate, PaymentDate)) AS AvgDaysToPayment FROM Payment WHERE PaymentDate >= DATEADD(month, -12, GETDATE()) GROUP BY YEAR(PaymentDate), MONTH(PaymentDate) ORDER BY Year, Month`
  - Last 12 months of payment activity
- **RunQuery 3**: Top accounts by outstanding balance (conditional)
  - Executes when aging bucket selected
  - `SELECT TOP 10 AccountName, COUNT(*) AS InvoiceCount, SUM(Outstanding) AS TotalOutstanding FROM vw_InvoicePayments WHERE AgeBucket = @Bucket GROUP BY AccountName ORDER BY TotalOutstanding DESC`
- **RunQuery 4**: Payment history for selected account (conditional)
  - Executes when account clicked from top accounts list
  - `SELECT InvoiceNumber, InvoiceDate, Total, PaidAmount, Outstanding, LastPaymentDate FROM vw_InvoicePayments WHERE AccountID = @AccountID ORDER BY InvoiceDate DESC`
- **EntityDataGrid 1**: Invoices in selected aging bucket
  - Entity: "Invoices"
  - Filter: Dynamic based on aging bucket (e.g., `Status != 'Paid' AND DATEDIFF(day, DueDate, GETDATE()) BETWEEN 30 AND 59`)
  - Columns: InvoiceNumber, Account, InvoiceDate, DueDate, Total, PaidAmount, Outstanding, DaysOverdue
  - Custom render for DaysOverdue (color-coded: green < 30, yellow 30-60, red 60+)
- **EntityDataGrid 2**: Payments for selected invoice (row click)
  - Entity: "Payments"
  - Filter: `InvoiceID = '{selectedInvoiceId}'`
  - Columns: PaymentDate, Amount, PaymentMethod, ReferenceNumber, Notes
- **Interactive Filter Panel**: User-controlled filters affecting all queries
  - Date range selector (affects RunQuery 2, EntityDataGrid 1)
  - Account type filter (affects all queries)
  - Minimum outstanding amount filter (affects RunQuery 1, 3)

**Component Structure**:
```
[User Filter Panel: DateRange, AccountType, MinAmount]
          ↓ (affects all queries)
[RunQuery 1: Aging Buckets] ─────────→ [Stacked Bar Chart: Outstanding by Aging]
[RunQuery 2: Payment Trends] ─────────→ [Dual-Axis Chart: Payments & Avg Days]
                                                   ↓ onClick aging bucket
                            ┌──────────────────────┼──────────────────────┐
                            ↓                      ↓                      ↓
            [RunQuery 3: Top Accounts]  [KPI Cards: Bucket Stats]  [EntityDataGrid 1: Invoices]
                      ↓ onClick account           ↓                      ↓ onRowClick
            [RunQuery 4: Account History]  [Display Metrics]    [EntityDataGrid 2: Payments]
                      ↓
            [Data Table: Account Detail]
```

**Key Learning**:
- Coordinating 4+ queries with conditional execution based on user interaction
- Implementing filter panel that affects multiple queries simultaneously
- Managing complex state with multiple selection levels (Bucket → Account → Invoice → Payments)
- Dynamic SQL filter generation based on aging bucket selection
- Custom column rendering with conditional formatting
- Dual-axis charts for comparing different metrics
- Performance optimization with query result caching
- Proper cleanup of conditional queries when selections change

**User Flow**:
1. View main dashboard with filters at top (default: all data, last 12 months)
2. See two main charts:
   - Top: Stacked bar chart of outstanding amounts by aging bucket
   - Bottom: Dual-axis chart showing monthly payment trends + avg days to payment
3. User adjusts filter: Account Type = "Enterprise", Min Outstanding = $10,000
   - All queries re-execute with new filters
   - Charts update to show filtered data
4. Click "60-90 days" aging bucket → Three panels appear:
   - Left: Top 10 accounts with most outstanding in this bucket
   - Center: KPI cards (total outstanding, invoice count, avg days overdue)
   - Right: EntityDataGrid showing all invoices in 60-90 day bucket
5. Click "Acme Corp" in top accounts list → Account history table appears below
   - Shows RunQuery 4 results in formatted table
6. Click specific invoice row in EntityDataGrid → Payments panel slides in
   - Shows all payments made against this invoice
7. User can click payment to open payment record via OpenEntityRecord
8. Change filters → All panels clear and re-execute with new criteria

**Props**:
- `defaultDateRange`: Initial date range for trends (default: 12 months)
- `showPaymentTrends`: Include payment trends chart (default: true)
- `showTopAccounts`: Include top accounts panel (default: true)
- `topAccountCount`: Number of accounts to show (default: 10)
- `enableFilters`: Show interactive filter panel (default: true)
- `colorCodeOverdue`: Apply color coding to overdue invoices (default: true)
- `cacheDuration`: Query result cache duration in seconds (default: 300)

**Status**: 📝 TODO

---

## Component 7: Deal Pipeline Visualization - Review & Fixes

### Implementation Status: ✅ COMPLETED

### Issues Discovered During Testing

#### Issue 1: Deal Entry Trends Showing Flat Line at Y=1
**Problem**: The "Deal Entry Trends" chart displayed a horizontal line at y-value 1 across all dates, indicating each date had exactly 1 deal.

**Root Cause Analysis**:
- Query was grouping by `OpenDate` without filtering by stage
- Since each deal has a unique `OpenDate`, every GROUP BY returned 1 row
- Query was supposed to show deals entering a SPECIFIC stage over time, not all deals

**Solution Applied**:
- Changed from daily to weekly aggregation: `DATEADD(week, DATEDIFF(week, 0, d.OpenDate), 0) AS Date`
- Made `Stage` parameter required (removed conditional WHERE clause)
- Updated component to only show trends chart when a stage is selected
- Changed ORDER BY to ASC for proper time-series visualization

**Files Modified**:
- [deal-stage-trends.sql](SQL Scripts/demo/metadata/queries/SQL/deal-stage-trends.sql) - Query refactored
- [deal-pipeline-visualization.js](metadata/components/code/query-examples/deal-pipeline-visualization.js) - Added conditional rendering

#### Issue 2: Deal Velocity Analysis Showing Negative Values
**Problem**: AvgDaysInPipeline showed negative values for some stages.

**Root Cause**: Using different calculation logic for `AvgDaysToClose` vs `AvgDaysInPipeline`, causing issues with old closed deals.

**Solution Applied**: Unified the CASE logic for both fields:
```sql
AVG(CASE
  WHEN d.ActualCloseDate IS NOT NULL
  THEN DATEDIFF(day, d.OpenDate, d.ActualCloseDate)
  ELSE DATEDIFF(day, d.OpenDate, GETDATE())
END) AS AvgDaysInPipeline
```

**Files Modified**:
- [deal-velocity-analysis.sql](SQL Scripts/demo/metadata/queries/SQL/deal-velocity-analysis.sql)

#### Issue 3: Date Filters Not Effective (Schema Design Problem)
**Problem**: StartDate and EndDate filters weren't properly filtering deals because queries used `__mj_CreatedAt` (system insert timestamp) instead of business dates.

**Root Cause**: Demo database lacked proper business date columns. Using `__mj_CreatedAt` meant:
- All test data showed same creation timestamp (when SQL script ran)
- Filtering by date range had no effect on results
- Couldn't demonstrate realistic time-based analytics

**Solution Applied**:
1. Enhanced schema: Added `OpenDate DATE` column to `CRM.Deal` table
2. Sub-agent updated 250 INSERT statements with realistic historical dates (spread across 18 months)
3. Added documentation via `sp_addextendedproperty`
4. Updated all 3 Deal Pipeline queries to use `OpenDate` instead of `__mj_CreatedAt`:
   - deal-stage-trends.sql
   - deal-velocity-analysis.sql
   - deal-pipeline-distribution.sql
5. Updated EntityDataGrid filters to use `OpenDate` for drill-down consistency

**Schema Enhancement**:
```sql
-- Added to CRM.Deal table
OpenDate DATE NULL,

-- Documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Date when the deal was opened/created from a business perspective',
    @level0type = N'SCHEMA', @level0name = N'CRM',
    @level1type = N'TABLE',  @level1name = N'Deal',
    @level2type = N'COLUMN', @level2name = N'OpenDate';
```

**Files Modified**:
- [CRM Schema 2 - Products - Deals - Invoices.sql](SQL Scripts/demo/CRM Schema 2 - Products - Deals - Invoices.sql) - Schema enhanced
- All 3 Deal Pipeline query SQL files
- [deal-pipeline-visualization.js](metadata/components/code/query-examples/deal-pipeline-visualization.js) - Updated filters

### Architectural Decisions

**Conditional Query Pattern**: Implemented pattern where secondary query (trends) only executes when user selects a segment from primary chart:

```javascript
// Trends query only runs when stage is selected
useEffect(() => {
  if (!selectedSegment) {
    setTrendsData([]);
    return;
  }

  const loadTrends = async () => {
    const result = await utilities.rq.RunQuery({
      QueryName: 'Deal Stage Trends',
      CategoryPath: 'Demo',
      Parameters: {
        Stage: selectedSegment.label,
        AccountType: accountType,
        MinAmount: minAmount,
        StartDate: appliedStartDate,
        EndDate: appliedEndDate
      }
    });

    if (result.Success) {
      setTrendsData(result.Results || []);
    }
  };

  loadTrends();
}, [selectedSegment, accountType, minAmount, appliedStartDate, appliedEndDate, utilities]);
```

**Benefits**:
- Reduces initial load time (only 2 queries instead of 3)
- Provides progressive disclosure of detail
- Saves database resources when user doesn't drill down

### Testing Results

✅ All three queries return correct data
✅ Chart interactions trigger appropriate drill-downs
✅ Date filters work correctly with OpenDate
✅ EntityDataGrid filters match chart selections
✅ Weekly aggregation shows meaningful trends
✅ Velocity analysis shows realistic metrics

### Key Lessons Learned

1. **Business Dates vs System Timestamps**: Always use business-meaningful date columns (`OpenDate`, `CloseDate`) for analytics, never system audit columns (`__mj_CreatedAt`)

2. **Aggregation Granularity**: Daily aggregation may be too granular for time-series trends - weekly or monthly often provides better visualization

3. **Required Parameters**: When a query only makes sense with specific parameters (like Stage), make them required rather than optional

4. **Conditional Rendering**: Show secondary visualizations only when they're relevant (user has made a selection)

5. **Schema Validation**: Always verify that demo/test data matches production-like patterns for realistic testing

---

## Component 8: Invoice Aging Analysis - Review & Major Refactoring

### Implementation Status: ✅ COMPLETED (After Major Architectural Refactoring)

### Architectural Decision: SQL + JavaScript Pattern

This component underwent a **complete architectural refactoring** to follow modern industry best practices. The original design had SQL performing all aggregation (GROUP BY with aging bucket CASE logic), but this was replaced with a simpler approach:

**Modern Pattern Adopted**:
- **SQL Responsibility**: Return raw/detail records with calculated fields (DaysOverdue)
- **JavaScript Responsibility**: Perform aggregation, bucketing, and formatting

**Rationale**:
1. **Flexibility**: Client-side code can re-aggregate data different ways without re-querying
2. **Reusability**: Raw invoice data can serve multiple visualizations and drill-downs
3. **Performance**: For dashboards with <10K rows, JavaScript aggregation is fast enough
4. **Maintainability**: Business logic (bucketing rules) in JavaScript is easier to test and modify
5. **Standard Practice**: This is the industry standard for dashboard components

### Industry Best Practices: SQL vs JavaScript Responsibilities

#### When SQL Should Aggregate
- **Millions of rows**: Can't load all data into browser memory
- **Database-level optimization**: Complex joins, window functions, CTEs benefit from query optimizer
- **Shared pre-aggregation**: Multiple clients need same rolled-up data (reports, APIs)
- **Heavy computation**: Statistical functions like percentiles, standard deviation

#### When JavaScript Should Aggregate
- **<10K rows**: Modern browsers handle this efficiently
- **Dynamic grouping**: User can switch between different aggregation dimensions
- **Client-side filtering**: Filter/search within loaded dataset without re-querying
- **Interactive dashboards**: Re-aggregate on filter changes, selections, drill-downs
- **Testing/debugging**: Business logic in JS is easier to unit test than SQL

#### The Modern Dashboard Pattern

**SQL Layer** (Outstanding Invoices Query):
```sql
-- Returns RAW invoice records with calculated fields
-- NO GROUP BY, NO aggregation - just filtering and field calculation
SELECT
  i.ID,
  i.InvoiceNumber,
  i.AccountID,
  i.Account,
  i.InvoiceDate,
  i.DueDate,
  i.Status,
  i.TotalAmount,
  i.AmountPaid,
  i.BalanceDue,
  DATEDIFF(day, i.DueDate, GETDATE()) AS DaysOverdue  -- Calculated field
FROM CRM.vwInvoices i
WHERE i.Status NOT IN ('Paid', 'Cancelled')
  AND i.BalanceDue > 0
  -- Optional filters
ORDER BY i.DueDate ASC, i.BalanceDue DESC
```

**JavaScript Layer** (Client-Side Aggregation):
```javascript
// Reusable aggregation function - can be called with different filters
const aggregateIntoAgingBuckets = (invoices) => {
  const buckets = {};

  // Group invoices into aging buckets
  invoices.forEach(inv => {
    const bucket =
      inv.DaysOverdue < 0 ? 'Not Yet Due' :
      inv.DaysOverdue < 30 ? '0-30 days' :
      inv.DaysOverdue < 60 ? '30-60 days' :
      inv.DaysOverdue < 90 ? '60-90 days' : '90+ days';

    if (!buckets[bucket]) {
      buckets[bucket] = {
        invoices: [],
        totalOutstanding: 0,
        totalDaysOverdue: 0
      };
    }

    buckets[bucket].invoices.push(inv);
    buckets[bucket].totalOutstanding += inv.BalanceDue;
    buckets[bucket].totalDaysOverdue += inv.DaysOverdue;
  });

  // Calculate aggregated metrics
  return Object.entries(buckets).map(([bucket, data]) => ({
    AgeBucket: bucket,
    InvoiceCount: data.invoices.length,
    TotalOutstanding: data.totalOutstanding,
    AvgDaysOverdue: Math.round(data.totalDaysOverdue / data.invoices.length),
    AvgOutstanding: data.totalOutstanding / data.invoices.length
  })).sort((a, b) => {
    const order = {
      'Not Yet Due': 0,
      '0-30 days': 1,
      '30-60 days': 2,
      '60-90 days': 3,
      '90+ days': 4
    };
    return order[a.AgeBucket] - order[b.AgeBucket];
  });
};
```

**Benefits Achieved**:
- Can re-aggregate filtered data instantly without database round-trip
- Can easily add new aggregation dimensions (by account type, by salesperson, etc.)
- Raw data available for detailed EntityDataGrid drill-down
- Business logic testable with simple unit tests
- Query is simpler and more reusable

### Issues Discovered During Testing

#### Issue 1: Invalid Column Name 'AgeBucket' in ORDER BY
**Problem**: SQL Server error: "Invalid column name 'AgeBucket'"

**Root Cause**: In queries with GROUP BY, you cannot reference column aliases in ORDER BY - must use the full expression.

**Original (Incorrect)**:
```sql
SELECT
  CASE
    WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 30 THEN '0-30 days'
    ...
  END AS AgeBucket
FROM ...
GROUP BY ...
ORDER BY AgeBucket  -- ❌ Can't use alias with GROUP BY
```

**Fixed**:
```sql
ORDER BY CASE
  WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 30 THEN 1
  WHEN DATEDIFF(day, i.DueDate, GETDATE()) < 60 THEN 2
  ...
END
```

**Note**: This error became moot after refactoring to remove SQL aggregation entirely.

**Files Modified**:
- Query was completely rewritten, so ORDER BY issue resolved

#### Issue 2: EntityDataGrid Only Showing Name and AccountType Columns
**Problem**: Drill-down EntityDataGrid showed only 2 columns instead of full invoice details.

**Root Cause**: Using non-existent field names in component's column definitions.

**Schema Validation Process**:
```bash
# Verified actual column names in vwInvoices view
sqlcmd -S localhost -d MJ -Q "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='CRM' AND TABLE_NAME='vwInvoices'"
```

**Discovered Mismatches**:
- Component used `AccountName` → Actual field is `Account` (lookup field)
- Component used `DaysOverdue` in orderBy → Not a stored column (calculated in query)

**Solution Applied**:
```javascript
// BEFORE (incorrect)
<EntityDataGrid
  entityName="CRM.Invoice"
  columns={['InvoiceNumber', 'AccountName', 'InvoiceDate', 'DueDate', 'BalanceDue']}
  orderBy="DaysOverdue DESC"
/>

// AFTER (correct)
<EntityDataGrid
  entityName="CRM.Invoice"
  columns={['InvoiceNumber', 'Account', 'InvoiceDate', 'DueDate', 'Status', 'BalanceDue']}
  orderBy="DueDate ASC"
/>
```

**Files Modified**:
- [invoice-aging-analysis.js](metadata/components/code/query-examples/invoice-aging-analysis.js)

#### Issue 3: Invalid Column Name 'DaysOverdue' in EntityDataGrid Filter
**Problem**: EntityDataGrid drill-down failed with SQL error: "Invalid column name 'DaysOverdue'"

**Root Cause**: `DaysOverdue` is calculated in the query but doesn't exist as a stored column in `CRM.vwInvoices`. EntityDataGrid's `extraFilter` prop translates to SQL WHERE clause, which can only reference actual columns.

**Critical Learning**: **EntityDataGrid Limitation** - Can only filter by actual stored columns in the base view, not by calculated fields from queries.

**Solution**: Convert calculated field logic to equivalent stored field conditions using `DueDate`:

```javascript
// Builds date-based filters that EntityDataGrid can use
const buildInvoiceFilter = () => {
  const filters = [];

  if (selectedSegment) {
    const bucket = selectedSegment.label;

    // Convert aging buckets to date-based filters
    if (bucket === 'Not Yet Due') {
      filters.push(`DueDate > GETDATE()`);
    } else if (bucket === '0-30 days') {
      filters.push(`DueDate BETWEEN DATEADD(day, -30, GETDATE()) AND GETDATE()`);
    } else if (bucket === '30-60 days') {
      filters.push(`DueDate BETWEEN DATEADD(day, -60, GETDATE()) AND DATEADD(day, -30, GETDATE())`);
    } else if (bucket === '60-90 days') {
      filters.push(`DueDate BETWEEN DATEADD(day, -90, GETDATE()) AND DATEADD(day, -60, GETDATE())`);
    } else if (bucket === '90+ days') {
      filters.push(`DueDate < DATEADD(day, -90, GETDATE())`);
    }
  }

  // Always filter to outstanding invoices only
  filters.push(`Status NOT IN ('Paid', 'Cancelled')`);
  filters.push(`BalanceDue > 0`);

  return filters.length > 0 ? filters.join(' AND ') : undefined;
};
```

**Files Modified**:
- [invoice-aging-analysis.js](metadata/components/code/query-examples/invoice-aging-analysis.js)

#### Issue 4: Payment History Filter Using Non-Existent 'AccountName' Field
**Problem**: Payment history drill-down failed when clicking an account.

**Root Cause**: Same field name mismatch - `AccountName` doesn't exist in schema.

**Solution**: Changed filter to use `Account='${selectedAccount.Account}'`

**Ultimate Resolution**: Removed entire payment history drill-down section per user request (see Issue 5).

#### Issue 5: Payment History Drill-Down Conflict with EntityDataGrid Navigation
**Problem**: User reported that payment history drill-down (clicking account to show payments) conflicted with EntityDataGrid's built-in row click navigation.

**User Decision**: Remove the payment history drill-down feature entirely.

**Rationale**: EntityDataGrid has default behavior to open records on row click. Adding custom click handlers creates UX confusion and navigation conflicts.

**Solution Applied**:
1. Removed `selectedAccount` state variable
2. Removed `handleAccountClick` function
3. Removed payment history EntityDataGrid section
4. Removed payment history query execution
5. Cleaned up all references

**Files Modified**:
- [invoice-aging-analysis.js](metadata/components/code/query-examples/invoice-aging-analysis.js) - Removed ~50 lines

#### Issue 6: Payment Trends Chart Showing Zero for All Months
**Problem**: Monthly payment trends chart displayed 0 for all months despite query returning data.

**Root Cause**: `fillMissingMonths()` function was using incorrect key structure. The query returns separate `Year` and `Month` fields (e.g., `Year: 2024, Month: 3`), but the function was trying to parse `Month` as a date object.

**Original (Incorrect)**:
```javascript
const fillMissingMonths = (data, monthsBack) => {
  const dataMap = new Map();
  data.forEach(item => {
    // ❌ Wrong: Trying to parse Month as date
    const date = new Date(item.Month);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    dataMap.set(key, item);
  });
  // ...
};
```

**Fixed**:
```javascript
const fillMissingMonths = (data, monthsBack) => {
  const dataMap = new Map();
  data.forEach(item => {
    // ✅ Correct: Use Year and Month fields directly
    const key = `${item.Year}-${item.Month}`;
    dataMap.set(key, item);
  });

  // Generate all months in range
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JS uses 0-indexed, SQL returns 1-indexed
    const key = `${year}-${month}`;
    const monthLabel = `${monthNames[date.getMonth()]} ${year}`;

    if (dataMap.has(key)) {
      result.push({
        ...dataMap.get(key),
        MonthName: monthLabel
      });
    } else {
      // Fill missing month with zeros
      result.push({
        Year: year,
        Month: month,
        MonthName: monthLabel,
        PaymentCount: 0,
        TotalPaid: 0,
        AvgPayment: 0,
        AvgDaysToPayment: 0,
        UniqueAccounts: 0
      });
    }
  }

  return result;
};
```

**Additional Enhancement**: Added year to month labels (e.g., "Jan 2024" instead of just "Jan") for clarity in longer date ranges.

**Files Modified**:
- [invoice-aging-analysis.js](metadata/components/code/query-examples/invoice-aging-analysis.js)

#### Issue 7: Component Stuck on Loading After State Cleanup
**Problem**: After removing payment history section, component showed loading indicator indefinitely.

**Root Cause**: Removed `selectedAccount` state variable but forgot to remove `setSelectedAccount()` calls in click handlers.

**Error in Console**: `ReferenceError: setSelectedAccount is not defined`

**Solution**: Searched codebase and removed all references:
```bash
# Found 2 occurrences
grep -n "setSelectedAccount" invoice-aging-analysis.js
```

**Files Modified**:
- [invoice-aging-analysis.js](metadata/components/code/query-examples/invoice-aging-analysis.js)

### Schema Validation Process

**Critical Best Practice**: Always verify column names against actual database schema before using in component code.

#### Verification Methods

**Method 1: Direct SQL Query**
```bash
sqlcmd -S localhost -d MJ -Q "
SELECT COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA='CRM' AND TABLE_NAME='vwInvoices'
ORDER BY COLUMN_NAME
"
```

**Method 2: Check BaseView Definition**
```bash
# Read the view creation script
cat "SQL Scripts/demo/CRM Schema 2 - Products - Deals - Invoices.sql" | grep -A 50 "CREATE VIEW.*vwInvoices"
```

**Method 3: Review Schema SQL Files**
- Open schema files in `SQL Scripts/demo/`
- Search for table/view definitions
- Note exact column names and types

#### Common Field Name Patterns in MemberJunction

**Lookup Fields**: Use the entity name, not concatenated variations
- ✅ Correct: `Account` (references CRM.Account table)
- ❌ Wrong: `AccountName`, `AccountID`, `Account_Name`

**Calculated Fields**: Only exist in query results, not in base views
- Can be used in component after RunQuery
- Cannot be used in EntityDataGrid `extraFilter`
- Must convert to stored field equivalents for filtering

**System Fields**: Standard MemberJunction audit columns
- `__mj_CreatedAt`, `__mj_UpdatedAt` - Always present
- Good for audit trails, not for business date filtering

#### EntityDataGrid Filter Requirements

**Critical Rule**: EntityDataGrid's `extraFilter` prop generates SQL WHERE clauses, so it can **only reference stored columns** in the base view.

**Example Conversions**:

| Calculated Field | Cannot Use In Filter | Stored Field Equivalent | Can Use In Filter |
|-----------------|---------------------|------------------------|------------------|
| `DaysOverdue` | ❌ `DaysOverdue > 90` | `DueDate` | ✅ `DueDate < DATEADD(day, -90, GETDATE())` |
| `BalancePercent` | ❌ `BalancePercent > 50` | `BalanceDue`, `TotalAmount` | ✅ `BalanceDue > (TotalAmount * 0.5)` |
| `AgeBucket` | ❌ `AgeBucket = '90+ days'` | `DueDate` | ✅ `DueDate < DATEADD(day, -90, GETDATE())` |
| `IsOverdue` | ❌ `IsOverdue = 1` | `DueDate` | ✅ `DueDate < GETDATE() AND Status != 'Paid'` |

### Testing Results

✅ Query returns raw invoice data with DaysOverdue calculated
✅ Client-side aggregation produces correct aging buckets
✅ Chart displays 5 buckets with accurate totals
✅ EntityDataGrid drill-down filters correctly using date-based logic
✅ Payment trends chart shows all 12 months with proper labels
✅ Zero-filling logic handles missing months correctly
✅ All filters (AccountType, MinOutstanding) work as expected
✅ Component loads without errors after state cleanup

### Key Lessons Learned

1. **Modern SQL + JavaScript Pattern**: For dashboards with <10K rows, return raw data from SQL and aggregate in JavaScript for maximum flexibility

2. **Schema Validation is Mandatory**: Always verify column names against actual database schema before writing component code. Never assume field names.

3. **EntityDataGrid Limitations**: Can only filter by stored columns, not calculated fields. Convert calculated logic to stored field equivalents.

4. **Calculated vs Stored Fields**: Be clear about which fields exist in base views vs which are calculated in queries. Document this distinction.

5. **Field Name Patterns**: MemberJunction uses entity names for lookups (e.g., `Account`), not concatenated variations (e.g., `AccountName`)

6. **Date-Based Filter Conversions**: When you need to filter by calculated days (DaysOverdue), convert to date arithmetic on stored date columns (DueDate)

7. **Component State Cleanup**: When removing features, use grep/search to find all references to removed state variables

8. **Data Structure Validation**: Verify the exact structure of query results (separate Year/Month fields vs combined dates) before writing aggregation logic

9. **Chart Data Completeness**: Always fill missing time periods with zero values for complete visualizations

10. **UX Conflicts**: Be aware of default EntityDataGrid behaviors (row click navigation) when adding custom interactions

### Files Modified

**Query Files**:
- [outstanding-invoices.sql](SQL Scripts/demo/metadata/queries/SQL/outstanding-invoices.sql) - Complete rewrite from aggregated to raw data query
- [.queries.json](SQL Scripts/demo/metadata/queries/.queries.json) - Updated metadata for renamed query

**Component Files**:
- [invoice-aging-analysis.js](metadata/components/code/query-examples/invoice-aging-analysis.js) - Added client-side aggregation, fixed multiple bugs
- [invoice-aging-analysis.json](metadata/components/.components.json) - Updated spec to reflect dataRequirements change (uses both queries and views)

**Schema Files**:
- None (validated existing schema, no changes needed)

### Architecture Comparison: Before vs After

**Before (SQL Aggregation Pattern)**:
```
SQL Query: GROUP BY aging buckets → Aggregated results
          ↓
Component: Display chart directly
          ↓
Problem: Can't drill down to detail records, can't re-aggregate differently
```

**After (JavaScript Aggregation Pattern)**:
```
SQL Query: Return raw invoices with DaysOverdue calculated
          ↓
Component: Aggregate into buckets client-side
          ↓
Benefits: Can drill down, can re-aggregate, can filter without re-querying
```

**Performance Comparison**:
- SQL aggregation: 1 query, ~5 rows returned, faster network transfer
- JavaScript aggregation: 1 query, ~500 rows returned, negligible processing time (<10ms)
- **Trade-off**: Slightly more data transferred for much more flexibility
- **Verdict**: For <10K rows, JavaScript approach is the modern standard

---

## Summary Table

| Component | Mode | Complexity | Queries | Grids | Key Teaching Point |
|-----------|------|------------|---------|-------|-------------------|
| 1. Monthly Invoice Revenue | queries | ⭐ | 1 | 0 | Basic SQL GROUP BY aggregation → SimpleChart |
| 2. Top Products Ranking | queries | ⭐⭐ | 1 | 0 | SQL TOP N ranking vs client-side sorting |
| 3. AI Model Analytics | queries | ⭐⭐⭐ | 3 | 0 | Multi-query coordination with Promise.all() |
| 4. Account Revenue Analysis | hybrid | ⭐ | 1 | 1 | Core hybrid pattern: RunQuery + EntityDataGrid |
| 5. Product Category Dashboard | hybrid | ⭐⭐ | 2 | 2 | Multi-level drilldown with conditional queries |
| 6. Event Submission Tracker | hybrid | ⭐⭐⭐ | 2 | 2 | Multi-panel layout with cross-entity drilldown |
| 7. Deal Pipeline Analyzer | hybrid | ⭐⭐⭐⭐ | 3 | 2 | Complex analytics with velocity and trends |
| 8. Invoice Payment Dashboard | hybrid | ⭐⭐⭐⭐⭐ | 4 | 2 | Master pattern with filters and 4-level drilldown |

## Design Patterns Summary

### RunQuery-Only Pattern
```javascript
const [data, setData] = useState(null);

useEffect(() => {
  const loadData = async () => {
    const result = await utilities.rq.RunQuery({QueryName: 'MyQuery'});
    setData(result.Results);
  };
  loadData();
}, []);

return <SimpleChart data={data} groupBy="Category" valueField="Total" />;
```

### Basic Hybrid Pattern
```javascript
const [chartData, setChartData] = useState(null);
const [selectedSegment, setSelectedSegment] = useState(null);

// Load aggregated data for chart
useEffect(() => {
  const result = await utilities.rq.RunQuery({QueryName: 'Aggregated'});
  setChartData(result.Results);
}, []);

const handleChartClick = (segment) => {
  setSelectedSegment(segment.label);
};

return (
  <>
    <SimpleChart data={chartData} onDataPointClick={handleChartClick} />
    {selectedSegment && (
      <EntityDataGrid
        entityName="DetailEntity"
        filter={`Category='${selectedSegment}'`}
        pageSize={50}
      />
    )}
  </>
);
```

### Advanced Multi-Level Pattern
```javascript
const [level1Selection, setLevel1Selection] = useState(null);
const [level2Selection, setLevel2Selection] = useState(null);
const [conditionalData, setConditionalData] = useState(null);

// Primary query always runs
useEffect(() => { /* Load level 1 data */ }, []);

// Conditional query runs when selection made
useEffect(() => {
  if (level1Selection) {
    // Load additional data based on selection
  }
}, [level1Selection]);

return (
  <>
    <Chart onClick={setLevel1Selection} />
    {level1Selection && (
      <>
        <Chart data={conditionalData} onClick={setLevel2Selection} />
        <EntityDataGrid filter={buildFilter(level1Selection)} />
      </>
    )}
    {level2Selection && (
      <EntityDataGrid filter={buildFilter(level1Selection, level2Selection)} />
    )}
  </>
);
```

---

## 🔍 Deep Analysis: All 17 Golden Example Queries

This analysis evaluates all queries against the refined design principles established during component development and testing.

### Design Principles Applied

1. **SQL Aggregation is Good** - Use GROUP BY for performance and memory efficiency
2. **JavaScript Should Handle Bucketing** - CASE statements for business logic categorization belong in JS, not SQL
3. **Query Pairs Pattern** - Create aggregation query + detail query instead of complex `buildEntityFilter()` logic
4. **Query Reusability** - Make queries general-purpose with template parameters
5. **Consistent Naming** - Standardize parameter names across queries (EventID, StartDate/EndDate, Status, etc.)

---

### Query-by-Query Analysis

#### 1. **account-payment-history.sql** ❌ NEEDS REFACTORING

**Current State**: Returns raw invoice + payment records with LEFT JOIN, includes CASE statement for `PaymentStatus`

**Issues**:
- **Bucketing in SQL** (lines 19-24): `PaymentStatus` CASE statement creates 'On Time'/'Late'/'Overdue'/'Pending' categories
- Business logic mixed into SQL that could change frequently
- Query less reusable because categorization is hardcoded

**Recommendation**:
- Remove `PaymentStatus` CASE statement
- Return raw fields: `PaymentDate`, `DueDate`, invoice dates
- JavaScript calculates `PaymentStatus` based on business rules

**JavaScript Pattern**:
```javascript
const categorizePaymentStatus = (payment, invoice) => {
  if (payment.PaymentDate <= invoice.DueDate) return 'On Time';
  if (payment.PaymentDate > invoice.DueDate) return 'Late';
  if (!['Paid', 'Cancelled'].includes(invoice.Status) && new Date() > new Date(invoice.DueDate)) return 'Overdue';
  return 'Pending';
};
```

**Benefits**: Business logic changes don't require SQL/database updates, query becomes more general-purpose

---

#### 2. **account-revenue-by-type.sql** ✅ GOOD QUERY

**Current State**: Aggregates paid invoice revenue by account type

**Assessment**:
- **SQL Aggregation**: Appropriate use of GROUP BY for performance
- **No Bucketing**: No CASE statements for categorization
- **Reusable**: Template parameters (AccountType, StartDate/EndDate) make it flexible
- **Naming**: Consistent parameter names

**Recommendation**: Keep as-is. This is a golden example of proper SQL aggregation.

---

#### 3. **ai-model-analytics-costs.sql** ✅ GOOD QUERY

**Current State**: Aggregates AI prompt runs by vendor with token totals

**Assessment**:
- **SQL Aggregation**: GROUP BY Vendor is correct for efficiency
- **No Bucketing**: Straightforward aggregation without business logic
- **Comment Note**: Has placeholder comment for actual cost calculation (line 12-13)

**Minor Improvement**:
- Add template parameter for `ModelName` to allow filtering by model
- Consider adding `ModelName` to GROUP BY for cost breakdown by model+vendor

**Recommendation**: Minor enhancement - add ModelName dimension for deeper analysis

---

#### 4. **ai-model-analytics-models.sql** ✅ GOOD QUERY

**Current State**: Groups AI prompt runs by model name with success/failure counts

**Assessment**:
- **SQL Aggregation**: Appropriate GROUP BY
- **No Bucketing**: Success/failure are data-driven, not categorized
- **Reusable**: Date range and vendor filters

**Recommendation**: Keep as-is. Clean aggregation query.

---

#### 5. **ai-model-analytics-trends.sql** ✅ GOOD QUERY

**Current State**: Daily AI prompt run counts for time-series analysis

**Assessment**:
- **SQL Aggregation**: GROUP BY date is perfect for trends
- **No Bucketing**: Pure aggregation without categorization
- **Performance**: Uses DATEADD with DaysBack parameter

**Recommendation**: Keep as-is. Excellent time-series query.

---

#### 6. **category-top-products.sql** ✅ GOOD QUERY

**Current State**: Returns top N products within a category by revenue

**Assessment**:
- **SQL Aggregation**: Appropriate for ranking products
- **No Bucketing**: Clean revenue aggregation
- **Reusable**: TopN and Category parameters make it flexible

**Recommendation**: Keep as-is. Good conditional drilldown query.

---

#### 7. **category-totals.sql** ✅ GOOD QUERY

**Current State**: Aggregates product revenue by category

**Assessment**:
- **SQL Aggregation**: Correct GROUP BY for category totals
- **No Bucketing**: Straightforward aggregation
- **Query Pair**: Works with category-top-products.sql for drilldown

**Recommendation**: Keep as-is. Good example of aggregation query in a query pair.

---

#### 8. **deal-pipeline-distribution.sql** ⚠️ MINOR ISSUE - BUCKETING IN SQL

**Current State**: Aggregates active deals by stage with metrics

**Issues**:
- **Stage Ordering in SQL** (lines 23-32): CASE statement orders stages by pipeline sequence
- This is **acceptable bucketing** because it's for sorting, not categorization
- However, JavaScript could handle sort order more flexibly

**Assessment**:
- SQL aggregation is appropriate
- CASE for ORDER BY is less problematic than CASE for categorization
- Query is reusable with good parameters

**Recommendation**: Keep as-is OR move stage ordering to JavaScript if sort order changes frequently. This is a borderline case - acceptable either way.

---

#### 9. **deal-stage-trends.sql** ✅ GOOD QUERY

**Current State**: Weekly counts of deals in selected stage grouped by OpenDate

**Assessment**:
- **SQL Aggregation**: GROUP BY week is correct for trends
- **No Bucketing**: Pure time-series aggregation
- **Requires Parameter**: Stage parameter is REQUIRED (line 6 comment)

**Recommendation**: Keep as-is. Good time-series query for specific stage analysis.

---

#### 10. **deal-velocity-analysis.sql** ✅ GOOD QUERY

**Current State**: Analyzes deal velocity by stage with win/loss metrics

**Assessment**:
- **SQL Aggregation**: Complex but appropriate aggregations (AvgDaysToClose, WinRate)
- **CASE Statements**: Used for conditional counting (won/lost), not categorization - acceptable
- **Performance**: Efficient calculation of win rates

**Recommendation**: Keep as-is. Complex aggregation is appropriate in SQL for performance.

---

#### 11. **monthly-invoice-revenue.sql** ✅ EXCELLENT QUERY

**Current State**: Flexible monthly revenue aggregation with conditional grouping by status

**Assessment**:
- **SQL Aggregation**: GROUP BY month is correct
- **Conditional Grouping**: Smart logic to optionally include Status dimension (lines 11, 35)
- **No Bucketing**: Pure aggregation
- **Highly Reusable**: StatusList, Year, Month, date range parameters

**Recommendation**: Keep as-is. This is a **golden example** of flexible, reusable query design.

---

#### 12. **outstanding-invoices.sql** ✅ EXCELLENT QUERY - RAW DATA PATTERN

**Current State**: Returns raw invoice records with calculated DaysOverdue field

**Assessment**:
- **No GROUP BY**: Returns individual records for JavaScript aggregation
- **Calculated Field**: DaysOverdue is a computed field (not bucketing)
- **Highly Reusable**: Multiple filter parameters
- **Query Pair Candidate**: Can be aggregated by JavaScript into aging buckets

**Recommendation**: Keep as-is. This is the **gold standard** for raw data queries. JavaScript can:
- Group into aging buckets
- Aggregate by account
- Calculate totals and averages
- Filter dynamically without re-querying

**Current Implementation**: Already follows the modern dashboard pattern documented earlier in this file (lines 2684-2803)

---

#### 13. **payment-trends.sql** ✅ GOOD QUERY

**Current State**: Monthly payment aggregation with days-to-payment metrics

**Assessment**:
- **SQL Aggregation**: GROUP BY month is appropriate
- **No Bucketing**: Pure aggregation
- **Reusable**: MonthsBack, PaymentMethod, AccountType parameters

**Recommendation**: Keep as-is. Clean time-series aggregation.

---

#### 14. **submission-review-timeline.sql** ✅ GOOD QUERY

**Current State**: Daily review counts with score averages for time-series

**Assessment**:
- **SQL Aggregation**: GROUP BY date is correct for trends
- **No Bucketing**: Straightforward aggregation
- **Reusable**: EventID, Status, date range filters

**Recommendation**: Keep as-is. Good time-series query for submission reviews.

---

#### 15. **submission-status-summary.sql** ✅ EXCELLENT QUERY - RAW DATA PATTERN (Recently Fixed)

**Current State**: Returns raw submission records with pre-aggregated speaker/review counts via subquery JOINs

**Assessment**:
- **No GROUP BY**: Returns individual records for JavaScript aggregation (fixed from previous buggy version)
- **Pre-aggregated JOINs**: Uses subqueries to avoid Cartesian product (lines 20-34)
- **Performance**: 3 table scans vs 18 with scalar subqueries
- **Highly Reusable**: JavaScript can aggregate by status, event, date ranges, etc.

**Recommendation**: Keep as-is. This query was recently refactored and is now a **golden example** of:
1. Raw data pattern (SQL returns records, JS aggregates)
2. Pre-aggregated subquery JOINs for performance
3. Avoiding Cartesian product bugs
4. Maximum reusability

**Component Implementation**: submission-review-dashboard.js demonstrates proper client-side aggregation with this query

---

#### 16. **top-accounts-by-outstanding.sql** ⚠️ NEEDS QUERY PAIR - BUCKETING IN SQL

**Current State**: Returns top N accounts by outstanding balance with conditional aging bucket filter

**Issues**:
- **Aging Bucket Bucketing** (lines 18-22): WHERE clause uses Nunjucks conditionals to filter by aging buckets
- This is actually **query filtering**, not categorization, so it's acceptable
- However, creates **coupling** with JavaScript bucketing logic

**Recommendation**: Consider creating a **query pair**:
- **Aggregation Query**: Return raw outstanding invoices (like outstanding-invoices.sql)
- **Detail Query**: top-accounts-by-outstanding.sql (keep current for backward compatibility)

**Alternative Approach**:
- Use outstanding-invoices.sql (already exists) as the source
- JavaScript aggregates into aging buckets AND top accounts
- Eliminates need for AgeBucket parameter filtering in SQL

**Assessment**: Current query is acceptable but could be more general-purpose by removing AgeBucket filtering and letting JavaScript handle it

---

#### 17. **top-products-ranking.sql** ✅ GOOD QUERY

**Current State**: Returns top N products by revenue with filters

**Assessment**:
- **SQL Aggregation**: GROUP BY product is appropriate
- **No Bucketing**: Clean revenue aggregation
- **Reusable**: TopN, Category, date range parameters

**Recommendation**: Keep as-is. Good ranking query.

---

### Summary Statistics

**Query Classification**:
- ✅ **Excellent Queries (Golden Standards)**: 3 queries
  - outstanding-invoices.sql (raw data pattern)
  - submission-status-summary.sql (raw data with pre-aggregated JOINs)
  - monthly-invoice-revenue.sql (flexible conditional grouping)

- ✅ **Good Queries (No Changes Needed)**: 11 queries
  - account-revenue-by-type.sql
  - ai-model-analytics-costs.sql
  - ai-model-analytics-models.sql
  - ai-model-analytics-trends.sql
  - category-top-products.sql
  - category-totals.sql
  - deal-stage-trends.sql
  - deal-velocity-analysis.sql
  - payment-trends.sql
  - submission-review-timeline.sql
  - top-products-ranking.sql

- ⚠️ **Minor Issues (Optional Improvements)**: 2 queries
  - deal-pipeline-distribution.sql (stage ordering in SQL)
  - top-accounts-by-outstanding.sql (aging bucket filtering coupling)

- ❌ **Needs Refactoring**: 1 query
  - account-payment-history.sql (PaymentStatus bucketing in SQL)

---

### Identified Query Pairs

**Existing Query Pairs** (Aggregation + Detail):
1. **Category Analysis**:
   - Aggregation: category-totals.sql
   - Detail: category-top-products.sql

2. **Outstanding Invoices** (One-to-Many):
   - Raw Data: outstanding-invoices.sql (can feed multiple views)
   - Detail: top-accounts-by-outstanding.sql (accounts view)
   - *Could add*: aging-bucket-summary.sql (aggregation view)

**Potential New Query Pairs**:
1. **Deal Pipeline**:
   - Existing: deal-pipeline-distribution.sql (aggregation by stage)
   - *Could add*: deal-pipeline-details.sql (raw deals in stage for drilldown)
   - **Current Workaround**: Components use EntityDataGrid with `buildEntityFilter()` - works but less optimal

2. **Payment Analysis**:
   - Existing: payment-trends.sql (monthly aggregation)
   - Existing: account-payment-history.sql (raw payment records)
   - **Assessment**: These work together but have different focuses - trends vs history

---

### Mergeable Queries (Generalization Opportunities)

**Product Queries** (Could Merge):
- top-products-ranking.sql
- category-top-products.sql

**Analysis**: Nearly identical queries, differ only in:
- top-products-ranking.sql: Optional Category filter, returns top N across all categories
- category-top-products.sql: Requires Category parameter (line 18)

**Recommendation**: Merge into single `product-ranking.sql` query:
```sql
-- Product Ranking Query
-- Returns top N products by revenue with optional category filtering
-- When Category parameter omitted, ranks across all categories
-- When Category parameter provided, ranks within that category

SELECT TOP ({% if TopN %}{{ TopN | sqlNumber }}{% else %}10{% endif %})
  p.Name AS ProductName,
  p.Category,
  SUM(ili.TotalPrice) AS TotalRevenue,
  SUM(ili.Quantity) AS TotalQuantity,
  COUNT(DISTINCT ili.InvoiceID) AS InvoiceCount,
  AVG(ili.UnitPrice) AS AvgPrice
FROM CRM.vwProducts p
INNER JOIN CRM.vwInvoiceLineItems ili ON ili.ProductID = p.ID
INNER JOIN CRM.vwInvoices i ON i.ID = ili.InvoiceID
WHERE i.Status = 'Paid'
  AND p.IsActive = 1
{% if Category %}  AND p.Category = {{ Category | sqlString }}
{% endif %}{% if StartDate %}  AND i.InvoiceDate >= {{ StartDate | sqlDate }}
{% endif %}{% if EndDate %}  AND i.InvoiceDate <= {{ EndDate | sqlDate }}
{% endif %}GROUP BY p.Name, p.Category
ORDER BY TotalRevenue DESC
```

**Benefits**:
- Eliminates duplicate query
- More general-purpose
- Consistent TopN parameter naming

---

### Naming Standardization Recommendations

**Parameter Naming Consistency** (Already Good):
- ✅ `StartDate` / `EndDate` - Used consistently across queries
- ✅ `AccountType` - Standard filtering parameter
- ✅ `TopN` - Consistent for TOP N queries
- ⚠️ `DaysBack` (ai-model-analytics-trends.sql) vs `MonthsBack` (payment-trends.sql, deal-velocity-analysis.sql)
  - **Recommendation**: Keep both - they serve different time scales appropriately

**Query Naming Consistency** (Already Good):
- Pattern: `{entity}-{metric/operation}.sql`
- Examples: account-revenue-by-type.sql, deal-pipeline-distribution.sql, payment-trends.sql
- ✅ Clear and descriptive

---

### Bucketing Analysis: SQL vs JavaScript

**Bucketing Found in SQL** (Should Move to JavaScript):
1. **account-payment-history.sql** - `PaymentStatus` categorization (lines 19-24)
   - Categories: 'On Time', 'Late', 'Overdue', 'Pending'
   - **Impact**: High - business logic that could change
   - **Action**: Move to JavaScript

**Acceptable CASE Statements** (Not Bucketing):
1. **deal-pipeline-distribution.sql** - Stage ordering (lines 23-32)
   - Purpose: Sort order in ORDER BY clause
   - **Impact**: Low - could stay in SQL or move to JS

2. **deal-velocity-analysis.sql** - Conditional counting (lines 9-22)
   - Purpose: Aggregate calculations (won/lost counts)
   - **Impact**: None - this is proper SQL aggregation

3. **ai-model-analytics-models.sql** - Success/failure counts (lines 9-11)
   - Purpose: Conditional aggregation
   - **Impact**: None - proper SQL aggregation

**Bucketing Found in Nunjucks Templates** (Filtering, Not Categorization):
1. **top-accounts-by-outstanding.sql** - AgeBucket filter (lines 18-22)
   - Purpose: WHERE clause filtering based on parameter
   - **Assessment**: This is query parameterization, not bucketing
   - **Impact**: Medium - creates coupling with JS bucket definitions
   - **Action**: Optional - could remove filter and let JS handle aging bucket logic

---

### Complex Filter Building (Candidates for Detail Queries)

**Components with `buildEntityFilter()` Logic**:

1. **deal-pipeline-visualization.js** (User mentioned this example)
   - Builds complex ExtraFilter for EntityDataGrid based on selected stage
   - **Current Workaround**: JavaScript constructs filter string
   - **Recommendation**: Create `deal-pipeline-details.sql` query
   - **Benefits**:
     - Centralized filter logic
     - Can use DataGrid instead of EntityDataGrid
     - More testable and maintainable

**Pattern to Watch For**:
```javascript
// Current pattern - complex filter building
const buildEntityFilter = (stage, accountType) => {
  let filter = `Stage = '${stage}'`;
  if (accountType) {
    filter += ` AND AccountID IN (SELECT ID FROM CRM.vwAccounts WHERE AccountType = '${accountType}')`;
  }
  return filter;
};

// Better pattern - use detail query
const detailData = await runQuery('deal-pipeline-details', { Stage: stage, AccountType: accountType });
```

---

### Recommendations Summary

#### Immediate Actions (High Priority):

1. **Refactor account-payment-history.sql**
   - Remove `PaymentStatus` CASE statement
   - Move bucketing logic to JavaScript
   - Update component: account-payment-history.js (if exists)

2. **Merge Product Queries**
   - Combine top-products-ranking.sql + category-top-products.sql
   - Create single `product-ranking.sql` with optional Category parameter
   - Update affected components

#### Optional Improvements (Medium Priority):

3. **Create Deal Pipeline Detail Query**
   - Add `deal-pipeline-details.sql` for drilldown
   - Replace `buildEntityFilter()` logic in deal-pipeline-visualization.js
   - Use DataGrid instead of EntityDataGrid

4. **Enhance AI Model Cost Query**
   - Add ModelName dimension to ai-model-analytics-costs.sql
   - Allow cost breakdown by vendor+model combination

5. **Simplify Top Accounts Query**
   - Consider removing AgeBucket parameter filtering from top-accounts-by-outstanding.sql
   - Let JavaScript handle aging bucket logic using outstanding-invoices.sql as source
   - More general-purpose query

#### Documentation Updates (Low Priority):

6. **Add Query Pair Metadata**
   - Document query relationships in .queries.json
   - Add comments linking paired queries
   - Example: "Use with category-top-products.sql for drilldown"

7. **Standardize Query Comments**
   - All queries should document:
     - Purpose and use case
     - Whether it's aggregation or raw data
     - Expected JavaScript processing
     - Query pair relationships (if applicable)

---

### Golden Query Checklist

Use this checklist when creating new queries:

- [ ] **SQL Aggregation**: Use GROUP BY for performance when appropriate
- [ ] **No Business Logic Bucketing**: Avoid CASE statements that categorize/bucket data
- [ ] **Calculated Fields**: Include computed fields (DaysOverdue, DaysToPayment) in SQL
- [ ] **Conditional Aggregation**: Use CASE in aggregation functions (COUNT(CASE WHEN...)) is fine
- [ ] **Template Parameters**: Use Nunjucks for flexible filtering
- [ ] **Smart Defaults**: Provide sensible defaults (TOP 10, last 12 months, etc.)
- [ ] **Consistent Naming**: Follow established parameter naming conventions
- [ ] **Query Pairing**: Consider if query needs aggregation + detail pair
- [ ] **Reusability**: Design for multiple use cases, not just one component
- [ ] **Documentation**: Clear comments explaining purpose and usage
- [ ] **Result Order**: Always specify ORDER BY for consistent results

---

## ✅ Success Criteria

**SQL Queries:**
- [ ] All 17 queries created with proper templates
- [ ] Parameters defined with correct types
- [ ] User tested queries return expected data
- [ ] Queries use appropriate schema placeholders

**Component Specs:**
- [ ] All 8 specs created with complete metadata
- [ ] dataRequirements mode matches usage
- [ ] All dependencies declared
- [ ] Properties and events documented

**Component Code:**
- [ ] All 8 components implemented
- [ ] Follow React runtime patterns
- [ ] Proper error handling
- [ ] Loading states implemented
- [ ] Pass component linter tests

**Testing:**
- [ ] All components pass linter with zero violations
- [ ] User confirms components work in UI
- [ ] Charts render correctly
- [ ] Drilldown interactions work
- [ ] Data displays accurately

---

## 📝 Component Spec Update Tasks (Session Continuation)

### Specs Already Updated:
1. ✅ **ai-model-analytics-dashboard.spec.json** - Added ModelName field/parameter to Costs query, added modelName property

### Specs To Update (Via Sub-Agents):

#### 2. deal-pipeline-visualization.spec.json
**Query: "Deal Pipeline Distribution"** (lines 12-103)
- Update `description` field (line 14) to: "Aggregates active deals by stage with comprehensive metrics: deal count, total value, average deal size, expected revenue, probability, and days in stage. Groups by Stage with optional filtering (Stage, AccountType, MinAmount, date range). Excludes 'Closed Won'/'Closed Lost' by default unless Stage parameter specified. Query pair with deal-pipeline-details.sql for drilldown. Stage ordering handled client-side for flexibility. **Result Order: Stage** - Alphabetical, client sorts by pipeline sequence."

#### 3. invoice-aging-analysis.spec.json
**Query 1: "Outstanding Invoices"**
- Update description to document raw data pattern, JOIN with vwAccounts, AccountType field
- Add AccountType field after Account field (sequence 5, nvarchar(255))
- Renumber subsequent fields

**Query 3: "Top Accounts by Outstanding"**
- Update description to remove aging bucket reference, document as general-purpose aggregation
- REMOVE AgeBucket parameter entirely

**Query 4: "Account Payment History"**
- Update description to document PaymentStatus bucketing moved to client-side
- REMOVE PaymentStatus field entirely

#### 4. top-products-ranking.spec.json
- Update query name from "Top Products Ranking" to "Product Ranking"
- Update description to document it replaces both top-products-ranking and category-top-products
- Update SQL file reference to product-ranking.sql

