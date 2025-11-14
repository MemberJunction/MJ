# MemberJunction Testing Framework Implementation Plan

## Executive Summary

Building a unified, extensible testing framework (`mj test`) that starts with AI evaluations for Skip Analytics Agent. The framework is designed to be **file-based** (works without MJ runtime for basic operations) and extensible to support multiple test types in the future (scenarios, integrations, etc.).

**Current Phase**: AI Evaluations (complete implementation)
**Future Phase**: Computer Use Agent (CUA) automated validation

## Architecture Overview

### Command Structure
```bash
mj test eval <eval-id>              # Run specific eval
mj test eval --category=simple      # Run evals by category
mj test eval --all                  # Run all evals
mj test list --type=eval            # List available evals
mj test validate --type=eval        # Validate eval JSON files
mj test report --type=eval          # Generate eval reports
```

### Core Principles

1. **File-Based**: Eval definitions are JSON files that can be validated, version controlled, and shared without requiring MJ runtime
2. **Human-First, AI-Ready**: Output designed for human validation now, CUA validation later
3. **Extensible**: Architecture supports multiple test types (eval, scenario, integration)
4. **Standards-Based**: Follow existing MJ patterns (MJCLI, AICLI, MetadataSync)

## Directory Structure

```
packages/MJCLI/
├── src/
│   ├── commands/
│   │   └── test/
│   │       ├── index.ts              # Base test command (placeholder for future)
│   │       ├── eval.ts               # Run AI evals
│   │       ├── list.ts               # List tests
│   │       ├── validate.ts           # Validate test files
│   │       └── report.ts             # Generate reports
│   └── services/
│       └── test/
│           ├── TestService.ts        # Base test orchestration
│           ├── EvalRunner.ts         # AI eval execution engine
│           ├── EvalValidator.ts      # JSON schema validation
│           └── EvalReporter.ts       # Report generation

Demos/AssociationDB/
├── evals/                            # AI eval definitions (already created)
│   ├── README.md                     # Framework documentation
│   ├── 01_simple/
│   ├── 02_trends/
│   ├── 03_cross_domain/
│   ├── 04_drill_downs/
│   └── 05_complex/
```

## Implementation Phases

### Phase 1: Foundation (THIS PHASE - COMPLETE IMPLEMENTATION)

**Goal**: Build complete file-based AI eval framework with human validation

#### 1.1 Base Command Infrastructure
- [x] Create `mj test` command structure in MJCLI
- [x] Add oclif command files
- [x] Configure command routing

#### 1.2 Eval Service Core
- [x] Create TestService base class
- [x] Create EvalRunner with file-based loading
- [x] Implement eval execution without MJ runtime required
- [x] Support for prompt execution (when runtime available)

#### 1.3 Validation System
- [x] Create EvalValidator service
- [x] JSON schema validation
- [x] Reference validation (@file, @sql)
- [x] Business logic validation

#### 1.4 Reporting System
- [x] Create EvalReporter service
- [x] Console output formatter
- [x] JSON output for CI/CD
- [x] Markdown report generation
- [x] Human-friendly validation checklist

#### 1.5 Commands Implementation
- [x] `mj test eval <id>` - Run single eval
- [x] `mj test eval --category=<cat>` - Run category
- [x] `mj test eval --all` - Run all evals
- [x] `mj test list --type=eval` - List evals
- [x] `mj test validate --type=eval` - Validate evals
- [x] `mj test report --type=eval` - Generate reports

#### 1.6 Integration
- [x] Update MJCLI package.json
- [x] Add test dependencies
- [x] Build and test commands

### Phase 2: Computer Use Agent Validation (FUTURE)

**Goal**: Automate validation using CUA models

**Why Future**: CUA models (Claude Computer Use, GPT-4V with computer use, etc.) are:
- Not yet widely available
- Inconsistent performance
- Cost-prohibitive for CI/CD at scale
- Rapidly evolving technology

**When Ready**:
- Add CUA integration to EvalRunner
- Implement screenshot/UI validation
- Add interaction simulation
- Update scoring to include automated checks

## File Format: AI Eval JSON

### Schema Definition
```json
{
  "eval_id": "unique-identifier",
  "category": "simple_aggregation | trend | cross_domain | drill_down | complex",
  "difficulty": "easy | medium | hard | very_hard",
  "tags": ["tag1", "tag2"],
  "business_context": "Why this matters",
  "prompt": "Natural language query to Skip",
  "expected_outcome": {
    "data_assertions": [
      {
        "metric": "metric_name",
        "expected_range": [min, max],
        "sql_validation": "SELECT ...",
        "description": "What this validates"
      }
    ],
    "visualization": {
      "type": "chart_type",
      "alternatives": ["type1", "type2"],
      "should_not_be": ["bad_type"],
      "reasoning": "Why this viz"
    },
    "required_features": ["feature1"],
    "optional_features": ["feature2"],
    "interactivity": [
      {
        "action": "user_action",
        "expected_result": "what_happens"
      }
    ]
  },
  "validation_criteria": {
    "data_correctness": 0.6,
    "visualization_choice": 0.2,
    "interactivity": 0.15,
    "performance": 0.05
  },
  "sample_sql": "-- Reference query",
  "human_eval_guidance": "What to check",
  "common_pitfalls": "Known issues"
}
```

## Detailed Task List

### 1. Project Setup
- [x] Create testing-framework branch
- [x] Create plan document
- [x] Set up TodoWrite tracking

### 2. Base Command Structure
- [ ] Create packages/MJCLI/src/commands/test/index.ts
- [ ] Create packages/MJCLI/src/commands/test/eval.ts
- [ ] Create packages/MJCLI/src/commands/test/list.ts
- [ ] Create packages/MJCLI/src/commands/test/validate.ts
- [ ] Create packages/MJCLI/src/commands/test/report.ts

### 3. Service Layer
- [ ] Create packages/MJCLI/src/services/test/TestService.ts
- [ ] Create packages/MJCLI/src/services/test/EvalRunner.ts
- [ ] Create packages/MJCLI/src/services/test/EvalValidator.ts
- [ ] Create packages/MJCLI/src/services/test/EvalReporter.ts
- [ ] Create packages/MJCLI/src/services/test/types.ts

### 4. Core Functionality
- [ ] Implement eval file discovery and loading
- [ ] Implement JSON schema validation
- [ ] Implement SQL validation query execution
- [ ] Implement prompt execution (when runtime available)
- [ ] Implement scoring system
- [ ] Implement result storage

### 5. Output Formatting
- [ ] Console output with color coding
- [ ] JSON output format
- [ ] Markdown report format
- [ ] Human validation checklist format

### 6. Testing & Validation
- [ ] Test with existing eval JSON files
- [ ] Validate all 20 evals pass validation
- [ ] Test execution against sample database
- [ ] Test report generation

### 7. Documentation
- [ ] Update MJCLI README with test commands
- [ ] Add examples to command help text
- [ ] Document eval JSON schema
- [ ] Add troubleshooting guide

### 8. Integration & Build
- [ ] Update package.json dependencies
- [ ] Build MJCLI package
- [ ] Test commands end-to-end
- [ ] Commit and push changes

## Command Examples

### Run Evals
```bash
# Run single eval
mj test eval active-members-basic

# Run by category
mj test eval --category=simple_aggregation

# Run by difficulty
mj test eval --difficulty=easy

# Run by tags
mj test eval --tags=membership,kpi

# Run all evals
mj test eval --all

# Dry run (validate only, don't execute)
mj test eval --all --dry-run
```

### List Evals
```bash
# List all evals
mj test list --type=eval

# List with details
mj test list --type=eval --verbose

# List by category
mj test list --type=eval --category=simple_aggregation

# Output as JSON
mj test list --type=eval --format=json
```

### Validate Evals
```bash
# Validate all eval files
mj test validate --type=eval

# Validate specific directory
mj test validate --type=eval --dir=./evals/01_simple

# Verbose output
mj test validate --type=eval --verbose

# JSON output for CI/CD
mj test validate --type=eval --format=json
```

### Generate Reports
```bash
# Generate report from last run
mj test report --type=eval

# Generate markdown report
mj test report --type=eval --format=markdown --output=eval-report.md

# Generate JSON report
mj test report --type=eval --format=json --output=eval-results.json
```

## Output Examples

### Console Output (Human Validation)
```
╔══════════════════════════════════════════════════════════════╗
║              Skip AI Analytics Agent Evaluation              ║
╔══════════════════════════════════════════════════════════════╗

Running: active-members-basic
Category: simple_aggregation
Difficulty: easy
Tags: membership, count, basic, kpi

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Business Context
Association leadership needs to quickly understand current active
membership size for board reports, capacity planning, and performance
tracking.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 Prompt
"How many active members do we have?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ SQL Validation Query Executed
  Expected: 380-420 active members
  Actual: 398 active members
  Status: PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Expected Outcome

Data Assertions:
  ✓ active_member_count: 398 (within range 380-420)

Visualization:
  Preferred: kpi_card
  Alternatives: single_metric, stat_card
  Should NOT be: pie_chart, bar_chart, line_chart
  Reasoning: Single numeric metric is best displayed as prominent KPI

Required Features:
  • show_count

Optional Features:
  • percentage_of_total
  • trend_indicator
  • click_to_drill

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 Human Validation Checklist

Please verify the following:

[ ] Count is in the 380-420 range
[ ] Visualization is simple and prominent (not a complex chart)
[ ] If interactive, clicking shows the member list

Common Pitfalls to Watch For:
• Including expired or cancelled memberships in the count
• Using an overly complex visualization for a simple metric
• Not handling members with multiple memberships correctly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏱️  Execution Time: 1.2s
📊 Automated Score: 60% (Data Correctness only)
👤 Human Validation Required: Yes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### JSON Output (CI/CD)
```json
{
  "eval_id": "active-members-basic",
  "status": "pass",
  "execution_time_ms": 1234,
  "automated_score": 0.6,
  "requires_human_validation": true,
  "data_assertions": [
    {
      "metric": "active_member_count",
      "expected_range": [380, 420],
      "actual_value": 398,
      "status": "pass"
    }
  ],
  "validation_checklist": [
    "Count is in the 380-420 range",
    "Visualization is simple and prominent",
    "If interactive, clicking shows member list"
  ],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Success Criteria

### Phase 1 Complete When:
1. ✅ All commands functional and tested
2. ✅ All 20 existing eval JSON files validate successfully
3. ✅ Can run evals and generate human validation checklists
4. ✅ SQL validation queries execute against sample database
5. ✅ Reports generate in console, JSON, and Markdown formats
6. ✅ Documentation complete and accurate

### Future Phase 2 (CUA) Complete When:
1. ❌ CUA integration added (future)
2. ❌ Automated UI validation working (future)
3. ❌ Full automated scoring implemented (future)

## Technical Notes

### File-Based Design
- Eval JSON files are the source of truth
- No database required for validation
- SQL queries can run if database available
- Prompt execution requires MJ runtime + Skip

### Graceful Degradation
```
Without Database:    Can validate JSON, list evals, check schema
With Database:       + Can validate SQL queries, check data assertions
With MJ Runtime:     + Can execute prompts against Skip
With CUA (future):   + Can validate UI/UX automatically
```

### Extension Points
- New test types: Add to `test/` directory
- New validation rules: Extend EvalValidator
- New output formats: Extend EvalReporter
- New scoring dimensions: Update validation_criteria

## Dependencies

### New Dependencies for MJCLI
```json
{
  "ajv": "^8.12.0",           // JSON schema validation
  "ajv-formats": "^2.1.1"     // Additional format validators
}
```

### Existing Dependencies (Already Available)
- oclif (CLI framework)
- chalk (colored output)
- ora (spinners)
- inquirer (prompts)

## Future Enhancements

### Phase 2: Computer Use Agent
- Automated screenshot analysis
- UI interaction simulation
- Full automated scoring
- Regression detection

### Phase 3: Broader Testing
- Business scenario tests
- Integration tests
- Performance tests
- Migration tests

### Phase 4: Advanced Features
- Parallel test execution
- Test result history tracking
- Performance regression detection
- AI-powered test generation

## Timeline

**Phase 1 (AI Evals)**: Complete implementation NOW
**Phase 2 (CUA)**: When CUA models are mature and cost-effective

## Questions & Decisions

### Q: Should we store eval results?
**A**: Yes, in JSON format alongside eval files (`.eval.result.json`)

### Q: How to handle Skip API authentication?
**A**: Use existing MJ configuration and Skip API credentials

### Q: Should we support custom eval types?
**A**: Yes, via plugin system (future enhancement)

### Q: How to handle flaky evals?
**A**: Retry logic with exponential backoff (future enhancement)

## Conclusion

This plan provides a complete, file-based AI evaluation framework that:
- Works without MJ runtime for basic operations
- Focuses on human validation (CUA is future)
- Follows MJ architectural patterns
- Extensible to broader testing needs
- Production-ready for Skip AI Analytics Agent

Let's build it! 🚀
