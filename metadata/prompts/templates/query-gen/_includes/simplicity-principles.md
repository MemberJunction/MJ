# Simplicity and Reusability Principles

**CRITICAL**: These queries will be stored in a library and reused across many business questions and scenarios. Simple, flexible queries are more valuable than hyper-specific ones.

## Core Philosophy

Return **raw data** and **simple aggregations**. Let the UI/reporting layer handle:
- Percentage calculations
- Complex derived metrics
- Formatting (dates, numbers, strings)
- Business rule categorization
- Dynamic thresholds

## Good Query Characteristics ✅

- Returns raw data columns (names, dates, counts, statuses, amounts)
- Uses simple aggregations (COUNT, SUM, AVG, MIN, MAX)
- Minimal CASE statements (only for essential categorization)
- Uses parameters for filtering (dates, statuses, thresholds, limits)
- Can answer multiple related business questions with different parameters
- Leaves complex calculations to the UI/reporting layer

## Bad Query Characteristics ❌

- Calculates complex derived metrics (retention rates, percentage calculations, ratios)
- Uses nested CASE statements for business rules
- Includes formatting logic (CAST to specific DECIMAL precision, string concatenation)
- Hyper-specific to one exact question with no flexibility
- Assumes domain knowledge without verification (e.g., what "renewed" or "active" means)
- Performs calculations that should be done in the presentation layer

## Practical Examples

### Example 1: Renewal Rate Query

❌ **Bad Approach** (Too Complex):
```sql
CAST(
  CASE WHEN COUNT(*) = 0 THEN 0
  ELSE (CAST(SUM(CASE WHEN RenewalDate IS NOT NULL THEN 1 ELSE 0 END) AS FLOAT)
        / COUNT(*)) * 100
  END
AS DECIMAL(5,2)) AS RenewalRatePercentage
```

✅ **Good Approach** (Simple & Reusable):
```sql
COUNT(*) AS TotalMemberships,
SUM(CASE WHEN RenewalDate IS NOT NULL THEN 1 ELSE 0 END) AS RenewedCount
-- UI calculates: (RenewedCount / TotalMemberships) * 100
```

**Why Good?** The UI can format percentages with any precision, localize the display, and even show different metrics (rate vs absolute numbers) based on user preference.

---

### Example 2: Customer Categorization

❌ **Bad Approach** (Hardcoded Business Rules):
```sql
CASE
  WHEN TotalRevenue > 10000 THEN 'Premium'
  WHEN TotalRevenue > 5000 THEN 'Standard'
  ELSE 'Basic'
END AS CustomerTier
```

✅ **Good Approach** (Raw Data):
```sql
TotalRevenue
-- UI applies dynamic tier thresholds based on:
-- - User-configurable rules
-- - Industry standards
-- - Real-time data distribution
```

**Why Good?** Business rules change. Tier thresholds that make sense today might not tomorrow. Raw revenue lets the UI apply current business logic.

---

### Example 3: Date Filtering

❌ **Bad Approach** (Hardcoded Logic):
```sql
WHERE OrderDate >= DATEADD(day, -90, GETDATE())
```

✅ **Good Approach** (Parameterized):
```sql
WHERE OrderDate >= {% raw %}{{ startDate | sqlDate }}{% endraw %}
  AND OrderDate < {% raw %}{{ endDate | sqlDate }}{% endraw %}
```

**Why Good?** Users can analyze any time period (last week, last quarter, fiscal year, custom range) without needing a new query for each scenario.

---

## Trust the UI Layer

Modern UI/reporting layers (like Skip-Brain) excel at:
- **Calculations**: JavaScript is faster than SQL for post-aggregation math
- **Formatting**: Apply user locale, preferences, and accessibility needs
- **Dynamic Logic**: Change business rules without touching the database
- **Interactivity**: Let users toggle between different views of the same data

The query's job is to **fetch the right data efficiently**, not to format it perfectly.
