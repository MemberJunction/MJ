# MemberJunction Testing Framework

## Overview

A comprehensive, extensible testing framework for MemberJunction that supports multiple test types through a metadata-driven architecture. The framework integrates deeply with MJ's existing trace infrastructure and MetadataSync capabilities to provide file-based test definitions, database-backed analytics, and rich execution tracking.

**First Implementation:** Agent Evals for validating AI agent behavior and outputs
**Future Support:** Business workflow scenarios, code generation tests, integration tests, performance tests

---

## Why Not Traditional Unit Testing?

### The MemberJunction Difference

Traditional unit testing makes sense for systems where developers write custom validation logic, business rules, and data access code. MemberJunction is fundamentally different:

1. **Auto-Generated Validation**: Check constraints, field types, and relationships are automatically enforced at every tier
2. **Metadata-Driven Behavior**: The framework ensures consistency based on metadata definitions
3. **CodeGen Guarantees**: Generated code follows proven patterns - testing it is like testing whether TypeScript enforces types

### What Actually Needs Testing

Instead of testing whether a required field is required (the framework ensures this), we need to test:
- **AI Agent Behavior**: Does the agent produce correct, safe, high-quality outputs?
- **Business Workflows**: Does the complete customer onboarding process work?
- **Integration Points**: Do AI agents interact correctly with the data layer?
- **Scenario Outcomes**: Does month-end processing produce correct results?
- **System Behavior**: Does the application behave correctly under real-world usage patterns?

---

## Architecture

### Key Principle

Everything (test definitions, results, and user feedback) flows through existing MJ Sync and Trace pipelines:

```
[JSON Test Definitions in Git]
        ↓ MJ Sync
[Test Tables in Database]
        ↓
[Test Runner CLI/API]
        ↓
[TestRun + Target Entities (AgentRun, etc.)]
        ↓
[Angular Admin UI: dashboards + run drill-down]
        ↓
[JSON Run History Exported Back to Git for Versioned History]
```

### Core Design Principles

1. **Polymorphic Test Types** - DriverClass pattern with MJ ClassFactory for extensibility
2. **Hierarchical Organization** - Test suites can contain other suites
3. **Bidirectional Navigation** - Reverse FKs from target entities (AgentRun, etc.) back to TestRun
4. **Trace Integration** - AgentRun.ID IS the trace (no separate trace table)
5. **Flexible Configuration** - JSON fields at every level for type-specific needs
6. **File + Database Hybrid** - Definitions in Git, results in DB, history exported back to Git

---

## Database Schema

### Core Tables

#### Test Type Definition
- **TestType** - Registers test drivers (e.g., "Agent Eval" → `AgentEvalDriver`)

#### Test Organization
- **TestSuite** - Hierarchical test suites (can nest via ParentID)
- **Test** - Individual test definitions with inputs, expected outcomes, configuration
- **TestSuiteTest** - Junction table linking tests to suites with sequence/overrides
- **TestRubric** - Reusable evaluation criteria (especially for LLM-as-judge)

#### Test Execution
- **TestSuiteRun** - Suite execution tracking with aggregated results
- **TestRun** - Individual test execution with full trace linkage
- **TestRunFeedback** - Human-in-the-loop validation and corrections

### Reverse Foreign Keys (Trace Integration)

Target entities link back to tests for bidirectional navigation:
- `AIAgentRun.TestRunID` → Links agent execution to test context
- `Conversation.TestRunID` → Tracks test conversations separately
- `ConversationDetail.TestRunID` → Links individual messages to tests
- `AIPromptRun.TestRunID` → Enables testing prompts in isolation

### Key Fields

**Test Definition:**
```typescript
{
  TypeID: UUID,  // Which test driver
  Name: string,
  InputDefinition: JSON,  // Test inputs/parameters
  ExpectedOutcomes: JSON,  // Success criteria
  Configuration: JSON,  // Type-specific config (oracles, rubrics)
  Tags: JSON,  // Categorization
  Priority: number,  // Execution ordering
}
```

**Test Execution:**
```typescript
{
  TestID: UUID,
  TargetType: string,  // "Agent Run", "Workflow Run", etc.
  TargetLogID: UUID,  // Polymorphic link to execution
  Status: "Passed" | "Failed" | "Error",
  InputData: JSON,  // Actual inputs used
  ActualOutputData: JSON,  // Actual results
  Score: 0.0000-1.0000,  // Overall score
  ResultDetails: JSON,  // Detailed results, metrics
}
```

---

## Test Types

### 1. Agent Evals (First Implementation)

Validates AI agent behavior through multi-oracle evaluation:

```json
{
  "name": "Pie Chart with Drilldown",
  "type": "Agent Eval",
  "inputs": {
    "prompt": "Create a React pie chart with drill-down to table view",
    "context": {...}
  },
  "expectedOutcomes": {
    "toolCalls": ["generateComponent"],
    "outputFormat": "json",
    "semanticGoals": [...]
  },
  "configuration": {
    "oracles": [
      { "type": "schema-validate" },
      { "type": "trace-no-errors" },
      { "type": "llm-judge", "rubricId": "component-quality-v1" }
    ]
  }
}
```

**Oracle Types:**
- **schema-validate** - Structural correctness
- **trace-no-errors** - Execution safety (no errors in agent run)
- **llm-judge** - Semantic quality via LLM evaluation
- **exact-match** - Deterministic output comparison
- **sql-validate** - Database state verification

**4-Dimensional Scoring:**
1. Data correctness (automated via SQL validation)
2. Visualization choice (human validation)
3. Interactivity (human validation)
4. Performance (timing metrics)

### 2. Workflow Scenarios (Future)

Multi-step business processes:

```yaml
name: "New Customer Onboarding"
type: "Workflow Scenario"
steps:
  - name: "Create Customer"
    action: "CreateEntity"
    entity: "Customer"
    capture:
      customerId: "$.ID"

  - name: "Run Credit Check"
    action: "ExecuteAction"
    params:
      CustomerID: "{{ context.customerId }}"
    expectations:
      CreditScore: ">= 600"
```

### 3. Other Future Types

- **Code Generation Tests** - Validate CodeGen output quality
- **Integration Tests** - External service interactions
- **Performance Tests** - Load testing, scalability
- **Migration Tests** - Data transformation correctness

---

## CLI Commands

### Test Execution
```bash
# Run specific test
mj test run <test-id>

# Run test suite
mj test suite <suite-id>

# Run by category/tag
mj test run --tag=agent-quality
mj test run --category=simple_aggregation

# Run all tests
mj test run --all

# Dry run (validate without executing)
mj test run <test-id> --dry-run
```

### Test Management
```bash
# List available tests
mj test list --type=eval

# Validate test definitions
mj test validate --type=eval

# Generate reports
mj test report --suite=<suite-id> --format=markdown
```

### CI/CD Integration
```bash
# Run smoke tests (fail fast)
mj test suite smoke --fail-fast

# Run with specific environment
mj test suite regression --environment=staging

# Generate JSON output for parsing
mj test run --all --format=json > results.json
```

---

## File-Based Test Definitions

Tests are defined in JSON files, synced via MJ Sync:

### Directory Structure
```
metadata/
└── test-evals/
    ├── .mj-sync.json           # Entity: "Tests"
    ├── 01_simple/
    │   ├── active-members.json
    │   ├── revenue-ytd.json
    │   └── .mj-folder.json     # Category defaults
    ├── 02_trends/
    │   ├── membership-growth.json
    │   └── .mj-folder.json
    └── 03_cross_domain/
        └── ...
```

### Example Test Definition
```json
{
  "fields": {
    "Name": "Active Members Count",
    "TypeID": "@lookup:Test Types.Name=Agent Eval",
    "InputDefinition": {
      "prompt": "How many active members do we have?",
      "context": {...}
    },
    "ExpectedOutcomes": {
      "dataAssertions": [
        {
          "metric": "active_member_count",
          "min": 380,
          "max": 420
        }
      ]
    },
    "Configuration": {
      "oracles": [
        { "type": "trace-no-errors" },
        { "type": "sql-validate", "query": "@file:sql/active-members.sql" }
      ]
    },
    "Tags": ["membership", "kpi", "basic"]
  }
}
```

### MJ Sync Workflow
```bash
# Edit test definitions locally
code metadata/test-evals/01_simple/active-members.json

# Validate
mj sync validate --dir=metadata/test-evals

# Push to database
mj sync push --dir=metadata/test-evals

# Run the test
mj test run active-members-count
```

---

## Execution Flow

### Agent Eval Example

1. **Load Test Definition** from database
2. **Execute Agent** with test inputs
   - Creates new AgentRun
   - AgentRun.TestRunID = TestRun.ID (bidirectional link)
3. **Run Oracles** to evaluate outputs
   - Schema validation
   - Trace error checking
   - LLM judgment
4. **Calculate Score** based on oracle results and weights
5. **Store Results** in TestRun table
6. **Link to Trace** via AgentRun (AgentRun.ID is the trace)

### Trace Navigation

From test result, drill down to full execution:
```
TestRun → AgentRun (via TargetLogID)
         → AgentRunSteps
         → PromptRuns
         → ActionExecutionLogs
         → ConversationDetails
```

From agent execution, find associated test:
```
AgentRun → TestRun (via TestRunID)
         → Test definition
         → Expected outcomes
         → Evaluation criteria
```

---

## Human Feedback Loop

### TestRunFeedback Table
```typescript
{
  TestRunID: UUID,
  ReviewerUserID: UUID,
  Rating: 1-10,
  IsCorrect: boolean,  // Override automated result
  CorrectionSummary: string,
  Comments: string
}
```

### Use Cases
- Validate LLM-as-judge accuracy
- Train evaluation rubrics
- Override false positives/negatives
- Capture domain expert knowledge
- Improve automated oracles over time

---

## Cost Tracking

Track costs at multiple levels:

**Estimated Costs (Test Definition):**
- `Test.EstimatedCostUSD` - Expected cost per run
- Used for budgeting and scheduling

**Actual Costs (Test Execution):**
- `TestRun.CostUSD` - Actual cost incurred
- Includes LLM tokens, compute, external APIs

**Suite Costs (Aggregated):**
- `TestSuiteRun.TotalCostUSD` - Sum of all test costs
- Dashboard shows cost trends over time

---

## Versioning & Regression Detection

### Git Integration
```typescript
{
  GitCommit: "abc123...",  // Code version tested
  AgentVersion: "skip-agent-2.1.0",  // System version
  Environment: "staging"
}
```

### Comparison Queries
```sql
-- Compare two test runs
SELECT
  t1.Score AS PreviousScore,
  t2.Score AS CurrentScore,
  t2.Score - t1.Score AS ScoreDelta
FROM TestRun t1
JOIN TestRun t2 ON t1.TestID = t2.TestID
WHERE t1.GitCommit = 'version-1'
  AND t2.GitCommit = 'version-2';

-- Success rate by version
SELECT
  AgentVersion,
  COUNT(*) AS TotalRuns,
  SUM(CASE WHEN Status = 'Passed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS SuccessRate
FROM TestRun
GROUP BY AgentVersion
ORDER BY AgentVersion;
```

---

## Rich Output for AI and Human Consumption

Tests produce structured, AI-friendly output:

```
[SCENARIO_START] Active Members Count
[CONTEXT] {"testId": "active-members-basic", "timestamp": "2025-01-09T14:30:00Z"}
[WHY] Testing basic aggregation query against membership data

[STEP 1/3] Execute Agent
[INPUT] "How many active members do we have?"
[AGENT] Skip Analytics Agent processing request
[RESULT] Generated query: SELECT COUNT(*) FROM Members WHERE Status = 'Active'

[STEP 2/3] Validate Data
[ORACLE] trace-no-errors: PASSED ✓
[ORACLE] sql-validate: COUNT(*) = 402 (expected 380-420) ✓
[ORACLE] schema-validate: Output matches expected schema ✓

[STEP 3/3] Calculate Score
[PASSED_CHECKS] 3/3
[SCORE] 1.0000
[COST] $0.0042 USD

[TEST_PASS] Active Members Count completed in 1.8s
[BUSINESS_OUTCOME] Agent correctly answered membership query
```

---

## Analytics & Reporting

### Test Success Trends
```sql
SELECT
  CAST(StartedAt AS DATE) AS RunDate,
  COUNT(*) AS TotalTests,
  SUM(CASE WHEN Status = 'Passed' THEN 1 ELSE 0 END) AS PassedTests,
  AVG(Score) AS AvgScore
FROM TestRun
WHERE TestID = @testId
GROUP BY CAST(StartedAt AS DATE)
ORDER BY RunDate;
```

### Cost Analysis
```sql
SELECT
  t.Name,
  COUNT(tr.ID) AS RunCount,
  AVG(tr.CostUSD) AS AvgCost,
  SUM(tr.CostUSD) AS TotalCost
FROM Test t
JOIN TestRun tr ON t.ID = tr.TestID
WHERE tr.StartedAt >= DATEADD(day, -30, GETDATE())
GROUP BY t.Name
ORDER BY TotalCost DESC;
```

### Quality Metrics
```sql
-- Tests requiring human review
SELECT
  t.Name,
  COUNT(CASE WHEN trf.IsCorrect = 0 THEN 1 END) AS FalsePositives,
  COUNT(CASE WHEN trf.IsCorrect = 1 AND tr.Status = 'Failed' THEN 1 END) AS FalseNegatives
FROM Test t
JOIN TestRun tr ON t.ID = tr.TestID
LEFT JOIN TestRunFeedback trf ON tr.ID = trf.TestRunID
GROUP BY t.Name;
```

---

## UI Dashboard (Future)

Angular components for test management:

### Views
1. **Suites** - List, tags, linked metadata
2. **Runs** - Pass rate, latency, agent version
3. **Case Detail** - Inputs, outputs, metrics, trace link
4. **Compare Runs** - Side-by-side regression diff
5. **Feedback Form** - Human review interface
6. **Cost Dashboard** - Spending trends and budgets

### Key Features
- Click from test result → full agent trace
- Filter test conversations from production
- Historical trend charts
- Cost analysis and optimization
- Human feedback collection

---

## Example: Agent Eval Test Definition

### Test JSON (in Git)
```json
{
  "fields": {
    "Name": "Pie Chart with Drilldown",
    "TypeID": "@lookup:Test Types.Name=Agent Eval",
    "Description": "Tests agent's ability to create interactive React components",
    "InputDefinition": {
      "prompt": "Create a React pie chart showing product revenue with drill-down to detailed table view",
      "context": {
        "database": "SalesDB",
        "tables": ["Products", "Sales"]
      }
    },
    "ExpectedOutcomes": {
      "toolCalls": ["generateComponent"],
      "componentType": "PieChartWithDrilldown",
      "interactiveFeatures": ["click-to-drill", "hover-tooltips"]
    },
    "Configuration": {
      "oracles": [
        {
          "type": "schema-validate",
          "schema": "ComponentSpecification"
        },
        {
          "type": "trace-no-errors",
          "allowWarnings": true
        },
        {
          "type": "llm-judge",
          "rubricId": "component-quality-v1",
          "threshold": 0.7
        }
      ],
      "weights": {
        "correctness": 0.4,
        "ux": 0.3,
        "maintainability": 0.3
      }
    },
    "Tags": ["component-generation", "visualization", "interactive"],
    "Priority": 100,
    "EstimatedDurationSeconds": 15,
    "EstimatedCostUSD": 0.05
  }
}
```

### Rubric Definition
```json
{
  "fields": {
    "Name": "Component Quality Rubric v1",
    "TypeID": "@lookup:Test Types.Name=Agent Eval",
    "PromptTemplate": "Evaluate the following React component on three dimensions:\n\n1. Correctness (40%): Does it meet the functional requirements?\n2. UX Quality (30%): Is it user-friendly and visually appropriate?\n3. Maintainability (30%): Is the code clean and well-structured?\n\nComponent:\n{{component}}\n\nRequirements:\n{{requirements}}\n\nReturn JSON: {correctness: 0-1, ux: 0-1, maintainability: 0-1, notes: string}",
    "Criteria": {
      "correctness": {
        "weight": 0.4,
        "description": "Functional accuracy and completeness",
        "scoringGuide": {
          "1.0": "Perfect implementation, all requirements met",
          "0.7": "Core functionality works, minor issues",
          "0.4": "Partial implementation, missing features",
          "0.0": "Does not work or missing critical features"
        }
      },
      "ux": {
        "weight": 0.3,
        "description": "User experience quality",
        "scoringGuide": {
          "1.0": "Excellent UX, intuitive and polished",
          "0.7": "Good UX, usable with minor improvements needed",
          "0.4": "Functional but poor UX",
          "0.0": "Unusable or confusing"
        }
      },
      "maintainability": {
        "weight": 0.3,
        "description": "Code quality and structure",
        "scoringGuide": {
          "1.0": "Excellent code, follows best practices",
          "0.7": "Good code, minor improvements possible",
          "0.4": "Messy code but functional",
          "0.0": "Unmaintainable code"
        }
      }
    },
    "Version": "1.0"
  }
}
```

---

## Implementation Phases

### Phase 1: Database Schema ✓
- [x] Create test framework tables
- [x] Add reverse FKs to target entities
- [x] Generate entity classes via CodeGen

### Phase 2: Core Framework
- [ ] Create `BaseTestDriver` abstract class
- [ ] Implement `AgentEvalDriver`
- [ ] Build CLI runner (`mj test` commands)
- [ ] Implement oracle types (schema, trace, llm-judge)

### Phase 3: MJ Sync Integration
- [ ] Configure MJ Sync for test definitions
- [ ] Set up file→DB sync workflow
- [ ] Create example test definitions
- [ ] Implement result export to JSON

### Phase 4: Execution Engine
- [ ] Test runner orchestration
- [ ] Suite execution with dependencies
- [ ] Cost tracking integration
- [ ] Result storage and aggregation

### Phase 5: UI Dashboard
- [ ] Test management screens
- [ ] Run history and trends
- [ ] Trace integration (click-through)
- [ ] Human feedback forms
- [ ] Cost dashboards

### Phase 6: Advanced Features
- [ ] Comparative evaluation (A/B testing agents)
- [ ] Replay mode (re-run from existing traces)
- [ ] Shadow evaluation (on live traffic)
- [ ] Scenario composition (build from smaller tests)

---

## Benefits

### For Development Teams
✅ **Version Controlled** - Test definitions in Git
✅ **Traceable** - Every result links to full execution trace
✅ **Extensible** - Easy to add new test types
✅ **Integrated** - Works with existing MJ infrastructure
✅ **Analyzable** - Rich querying and reporting

### For AI Agents
✅ **Structured Output** - AI-friendly test results
✅ **Business Context** - Failures explained in domain terms
✅ **Trace Access** - Full execution history for debugging
✅ **Automated Evaluation** - LLM-as-judge for quality

### For Business Users
✅ **Clear Metrics** - Pass rates, costs, quality scores
✅ **Trend Analysis** - Performance over time
✅ **Cost Visibility** - Track testing expenses
✅ **Quality Assurance** - Confidence in system behavior

---

## Summary

This testing framework recognizes that in a metadata-driven platform like MemberJunction, testing individual code units is like testing whether gravity works - the framework ensures it. What matters is whether AI agents, business processes, and system behaviors work correctly end-to-end.

By combining:
- **File-based test definitions** (version controlled, portable)
- **Database-backed execution tracking** (queryable, analyzable)
- **Deep trace integration** (debuggable, auditable)
- **Multiple test types** (agents, workflows, integrations)
- **Human feedback loops** (trainable, improvable)

We create a framework that validates what truly matters: **Does the system serve the business correctly?**

The result is tests that:
1. **Survive refactoring** - Business outcomes matter, not implementation details
2. **Provide clear value** - "Agent produces quality output" vs "Method X returns Y"
3. **Enable AI assistance** - Business context makes failures understandable and fixable
4. **Match real usage** - Test what users actually do, not what developers wrote
