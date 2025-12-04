# Golden Example Components - Complete Implementation Guide

This document provides everything needed to implement 8 golden example components that demonstrate proper data loading patterns in MemberJunction React components.

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
    "CategoryID": "@lookup:Query Categories.Name=CRM Analytics",
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

**Status**: 📝 TODO

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
