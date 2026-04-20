FIXED TWO-LEVEL DRILL-DOWN ONLY: Chart-to-table component with HARDCODED vertical layout. Shows chart at top, data grid at bottom when clicking segments.

#### SimpleDrilldownChart - ONLY use when:
✅ Exactly 2 levels: Chart → Table (no more)
✅ Single aggregation dimension (group by ONE field)
✅ Drill-down shows detail records from same entity

❌ DO NOT USE SimpleDrilldownChart when:
- 3+ drill levels needed (chart → chart → table)
- Chart-to-chart drill-down (must be chart → table only)
- Multiple aggregation dimensions (e.g., "by Industry then by Region")
- Progressive hierarchy drill-downs
- Any pattern more complex than "click segment, see records"
- User asks for 'sub-charts' or 'nested chart' or 'drill into another chart'
- Need multi-level drill-downs (chart→chart→table or 3+ levels)
- Nested visualizations
- Progressive dimension drill-downs (Industry→Region→Accounts)

This component CANNOT support custom drill hierarchies - must create custom component for complex multi-level patterns. Example that requires custom component: 'Accounts by Industry, click to see chart by Region, click to see table of accounts' (3 levels).
