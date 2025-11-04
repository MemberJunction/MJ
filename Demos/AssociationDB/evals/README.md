# Skip AI Analytics Agent - Evaluation Framework

Comprehensive evaluation suite for testing Skip's ability to generate interactive analytics components from natural language queries against the Association Sample Database.

## 🎯 Purpose

Skip is designed to transform natural language requests into interactive, drill-down capable analytics components. This eval framework provides:

1. **Quality Benchmarking** - Measure Skip's performance across query types
2. **Regression Detection** - Catch when changes break existing functionality
3. **Coverage Analysis** - Identify query patterns Skip handles well/poorly
4. **Demo Preparation** - Real business scenarios for demonstrations
5. **Documentation** - Examples of what Skip can do

## 📊 Evaluation Categories

### **1. Simple Aggregations** (`01_simple/`)
**Difficulty**: Easy
**Purpose**: Test basic counting, summing, and single-metric displays

Examples:
- "How many active members do we have?"
- "What's our total revenue this year?"
- "How many Fortune 500 CEOs are members?"

**Expected Output**: KPI cards, single metrics, simple counts

---

### **2. Trends & Time-Series** (`02_trends/`)
**Difficulty**: Medium
**Purpose**: Test time-based analysis and trend visualization

Examples:
- "Show membership growth over the past 5 years"
- "Event attendance trends by quarter"
- "Email open rates month-over-month"

**Expected Output**: Line charts, area charts, trend indicators

---

### **3. Cross-Domain Analysis** (`03_cross_domain/`)
**Difficulty**: Medium
**Purpose**: Test queries spanning multiple schemas/domains

Examples:
- "Which events generated the most revenue?"
- "Top members by course completions"
- "Revenue breakdown by source"

**Expected Output**: Bar charts, ranked lists, comparison views

---

### **4. Drill-Down Interactions** (`04_drill_downs/`)
**Difficulty**: Hard
**Purpose**: Test interactive filtering and hierarchical navigation

Examples:
- "Show chapter engagement with ability to see individual members"
- "Event ROI with drill-down to individual registrants"
- "Course performance with enrollment details"

**Expected Output**: Interactive tables, charts with click-through, nested views

---

### **5. Complex Multi-Step** (`05_complex/`)
**Difficulty**: Very Hard
**Purpose**: Test sophisticated analysis requiring multiple data transformations

Examples:
- "Member lifetime value segmented by join year"
- "Complete member journey across all activities"
- "Campaign performance with conversion attribution"

**Expected Output**: Dashboards, multiple coordinated views, complex filters

---

## 📋 Eval JSON Schema

Each eval is stored as a JSON file with this structure:

```json
{
  "eval_id": "unique-identifier",
  "category": "simple_aggregation | trend | cross_domain | drill_down | complex",
  "difficulty": "easy | medium | hard | very_hard",
  "tags": ["keyword1", "keyword2"],

  "business_context": "Why would a user ask this question?",
  "prompt": "The exact natural language query to Skip",

  "expected_outcome": {
    "data_assertions": [
      {
        "metric": "metric_name",
        "expected_value": 123,
        "expected_range": [100, 150],
        "sql_validation": "SELECT COUNT(*) FROM ...",
        "description": "What this validates"
      }
    ],
    "visualization": {
      "type": "preferred_viz_type",
      "alternatives": ["acceptable_alternative1", "acceptable_alternative2"],
      "should_not_be": ["inappropriate_viz_type"],
      "reasoning": "Why this viz type makes sense"
    },
    "required_features": ["feature1", "feature2"],
    "optional_features": ["nice_to_have1"],
    "interactivity": [
      {
        "action": "user_action_description",
        "expected_result": "what_should_happen"
      }
    ]
  },

  "validation_criteria": {
    "data_correctness": 0.6,
    "visualization_choice": 0.2,
    "interactivity": 0.15,
    "performance": 0.05
  },

  "sample_sql": "-- Reference SQL query that produces expected data",

  "human_eval_guidance": "What human evaluator should look for",
  "common_pitfalls": "Known issues or edge cases"
}
```

## 🏃 Running Evals

### **Manual Evaluation (Current)**

```bash
# Run all evals
npm run evals

# Run specific category
npm run evals -- --category=simple

# Run single eval
npm run evals -- --id=member-count-basic
```

**Process:**
1. Script loads eval JSON
2. Displays the prompt to Skip
3. Skip generates component
4. Evaluator reviews output against expected_outcome
5. Scores on 1-5 scale for each criterion
6. Results saved to `eval_results.json`

### **Semi-Automated (Future)**

- Automated: Data range validation, SQL query comparison
- Manual: Visualization appropriateness, UX quality

### **Full Automation (Future)**

- Computer Use agent clicks through Skip's output
- Validates interactivity works as expected
- Compares rendered output to reference screenshots

## 📈 Scoring System

Each eval receives scores in 4 dimensions:

### **1. Data Correctness (60% weight)**
- 5: Exact match to expected data
- 4: Within acceptable range (±5%)
- 3: Directionally correct but some errors
- 2: Significant data errors
- 1: Completely wrong data

### **2. Visualization Choice (20% weight)**
- 5: Perfect visualization for the question
- 4: Good choice, could be slightly better
- 3: Acceptable but not ideal
- 2: Poor choice, hard to interpret
- 1: Completely inappropriate viz type

### **3. Interactivity (15% weight)**
- 5: All required + optional features work perfectly
- 4: All required features work
- 3: Most features work, minor issues
- 2: Key features missing or broken
- 1: No interactivity

### **4. Performance (5% weight)**
- 5: Instant (<1s)
- 4: Very fast (1-2s)
- 3: Acceptable (2-5s)
- 2: Slow (5-10s)
- 1: Unacceptably slow (>10s)

**Overall Score** = weighted average of all dimensions

## 📊 Success Criteria

### **By Difficulty Level:**
- **Easy**: 90%+ should score 4.0+
- **Medium**: 75%+ should score 3.5+
- **Hard**: 60%+ should score 3.0+
- **Very Hard**: 50%+ should score 3.0+

### **By Category:**
- **Simple Aggregations**: Should be near-perfect
- **Trends**: Visualization choice critical
- **Cross-Domain**: Data correctness most important
- **Drill-Downs**: Interactivity must work
- **Complex**: Acceptable if directionally correct

## 🎨 Example Eval Breakdown

**Eval**: "How many active members do we have?"

**Expected Outcome:**
- Data: ~400 members (80% of 500 total)
- Viz: Single metric / KPI card
- Features: Show percentage of total (optional), trend sparkline (optional)
- Interactivity: Click to see member list (optional)

**Validation SQL:**
```sql
SELECT COUNT(*) FROM membership.Member m
JOIN membership.Membership ms ON m.ID = ms.MemberID
WHERE ms.Status = 'Active' AND ms.EndDate >= GETDATE();
```

**Good Output:**
```
┌─────────────────────┐
│  Active Members     │
│       402          │
│   80.4% of total   │
│   ▁▂▃▅▇ +12 YoY    │
└─────────────────────┘
```

**Poor Output:**
- Shows all 500 members (wrong data)
- Uses a pie chart (wrong viz)
- No way to see who the members are (missing interactivity)

## 📁 File Organization

```
/evals/
├── README.md                        # This file
├── 01_simple/
│   ├── active_members.json
│   ├── total_courses.json
│   ├── fortune500_ceos.json
│   ├── ytd_revenue.json
│   └── upcoming_events.json
├── 02_trends/
│   ├── membership_growth.json
│   ├── event_attendance_trend.json
│   ├── course_enrollment_trend.json
│   └── email_engagement_trend.json
├── 03_cross_domain/
│   ├── event_revenue.json
│   ├── top_engaged_members.json
│   ├── revenue_by_source.json
│   └── chapter_membership_distribution.json
├── 04_drill_downs/
│   ├── chapter_engagement_drilldown.json
│   ├── event_roi_drilldown.json
│   ├── course_performance_drilldown.json
│   └── revenue_transactions_drilldown.json
├── 05_complex/
│   ├── member_lifetime_value.json
│   ├── member_journey_timeline.json
│   ├── campaign_conversion_attribution.json
│   └── segmented_engagement_analysis.json
├── eval-runner.js                   # Node.js runner script
├── eval-results.json                # Latest results
└── package.json                     # Dependencies
```

## 🔧 Development Workflow

### **Adding New Evals:**

1. Identify gap in coverage
2. Create JSON file in appropriate category folder
3. Validate SQL query returns expected data
4. Test prompt with Skip manually
5. Document expected outcome
6. Add to eval suite

### **Updating Evals:**

1. If association database schema changes, update SQL
2. If data volumes change, update expected ranges
3. If Skip capabilities improve, raise expectations
4. Keep eval IDs stable for historical comparison

### **Analyzing Results:**

```bash
# Generate report
npm run evals:report

# Compare two runs
npm run evals:compare -- --baseline=run1.json --current=run2.json

# Show failures only
npm run evals:failures
```

## 💡 Best Practices

### **Writing Good Prompts:**
- ✅ **DO**: Use natural language a real user would use
- ✅ **DO**: Be specific about what you want to see
- ✅ **DO**: Include context when needed ("for Q4 2024")
- ❌ **DON'T**: Write SQL-like pseudo-queries
- ❌ **DON'T**: Include implementation hints

### **Setting Expectations:**
- ✅ **DO**: Use ranges for counts (380-420, not exactly 400)
- ✅ **DO**: Allow multiple valid visualization types
- ✅ **DO**: Distinguish required vs. nice-to-have features
- ❌ **DON'T**: Expect pixel-perfect output
- ❌ **DON'T**: Over-specify implementation details

### **Validation SQL:**
- ✅ **DO**: Match the exact data Skip should show
- ✅ **DO**: Include comments explaining logic
- ✅ **DO**: Use same date parameters as prompt
- ❌ **DON'T**: Write overly complex queries
- ❌ **DON'NOT**: Hardcode dates that will become stale

## 🚀 Future Enhancements

1. **Automated Data Validation**: Run SQL queries and compare results
2. **Screenshot Comparison**: Visual regression testing
3. **Performance Benchmarking**: Track query execution time
4. **A/B Testing**: Compare different Skip prompt strategies
5. **User Study Integration**: Real user feedback on outputs
6. **Coverage Metrics**: Track which query patterns are tested

## 📚 References

- **Association Database Schema**: `../docs/SCHEMA_OVERVIEW.md`
- **Sample Queries**: `../docs/SAMPLE_QUERIES.md`
- **Business Scenarios**: `../docs/BUSINESS_SCENARIOS.md`
- **Skip Documentation**: [Link to Skip docs]

---

**Last Updated**: 2025-01-04
**Total Evals**: 20
**Coverage**: 5 categories, 4 difficulty levels
