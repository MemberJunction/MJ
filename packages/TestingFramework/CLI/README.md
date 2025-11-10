# MemberJunction Testing CLI

Command-line interface for the MemberJunction Testing Framework. Provides a thin CLI layer on top of the Testing Engine, enabling test execution, management, and reporting from the command line.

## Architecture

The CLI is designed as a thin wrapper around the Testing Engine, ensuring feature parity between CLI and API:

```
MJCLI (mj command)
    ↓
Testing CLI Commands (mj test *)
    ↓
Testing Engine (actual logic)
    ↓
Database / Entities
```

This architecture allows:
- **CLI and API parity** - Same engine powers both interfaces
- **Thin CLI layer** - Commands focus on user interaction, not business logic
- **Testability** - Engine can be tested independently
- **Flexibility** - Easy to add GraphQL/REST APIs later

## Integration with MJCLI

The Testing CLI integrates with the main MJCLI package following the same pattern as MetadataSync:

**In MJCLI package** (`packages/MJCLI/src/commands/test/`):
```typescript
// Thin command that delegates to Testing CLI
import { RunCommand } from '@memberjunction/testing-cli';

export default class TestRun extends Command {
  async run() {
    // Minimal setup, delegate to testing CLI
    await RunCommand.execute(this.parse);
  }
}
```

**In Testing CLI package** (`packages/TestingFramework/CLI/src/commands/`):
```typescript
// Full implementation
export class RunCommand {
  async execute(args, flags) {
    // Use Testing Engine for actual work
    const engine = new TestEngine();
    const result = await engine.runTest(...);
    // Format output for CLI
    this.displayResults(result);
  }
}
```

## Commands

### `mj test run`

Run a single test or suite of tests.

```bash
# Run specific test by ID
mj test run <test-id>

# Run test by name
mj test run --name="Active Members Count"

# Run test suite
mj test run --suite=<suite-id>

# Run with filtering
mj test run --tag=smoke
mj test run --category=agent-eval
mj test run --difficulty=easy

# Run all tests
mj test run --all

# Dry run (validate without executing)
mj test run <test-id> --dry-run

# Specify environment
mj test run <test-id> --environment=staging

# Output formats
mj test run <test-id> --format=json
mj test run <test-id> --format=markdown
mj test run <test-id> --format=console (default)

# Save results to file
mj test run <test-id> --output=results.json
```

**Example Output:**
```
[TEST_START] Active Members Count
[TYPE] Agent Eval
[CONTEXT] {"testId": "abc-123", "environment": "staging"}

[STEP 1/3] Execute Agent
[INPUT] "How many active members do we have?"
[AGENT] Skip Analytics Agent
[DURATION] 1.8s
✓ Agent executed successfully

[STEP 2/3] Run Oracles
[ORACLE] trace-no-errors: PASSED ✓
[ORACLE] sql-validate: COUNT(*) = 402 (expected 380-420) ✓
[ORACLE] schema-validate: Output matches schema ✓

[STEP 3/3] Calculate Score
[PASSED_CHECKS] 3/3
[SCORE] 1.0000 (100%)
[COST] $0.0042 USD

[TEST_PASS] Active Members Count
[DURATION] 1.8s
[TRACE_ID] Agent Run: abc-xyz-123
```

### `mj test suite`

Run a complete test suite.

```bash
# Run suite by ID
mj test suite <suite-id>

# Run suite by name
mj test suite --name="Agent Quality Suite"

# Parallel execution
mj test suite <suite-id> --parallel

# Fail fast (stop on first failure)
mj test suite <suite-id> --fail-fast

# Specific sequence
mj test suite <suite-id> --sequence=1,3,5
```

**Example Output:**
```
[SUITE_START] Agent Quality Suite
[TESTS] 15 tests queued

[1/15] Active Members Count
✓ PASSED (1.8s, score: 1.0000)

[2/15] Revenue Year-to-Date
✓ PASSED (2.1s, score: 0.9500)

[3/15] Complex Aggregation
✗ FAILED (3.2s, score: 0.6000)
  - Oracle 'llm-judge' failed: Component quality below threshold

...

[SUITE_COMPLETE] Agent Quality Suite
[SUMMARY] 13/15 passed (86.7%)
[DURATION] 28.4s
[COST] $0.12 USD
[FAILURES] 2 tests failed - see details above
```

### `mj test list`

List available tests, suites, and types.

```bash
# List all tests
mj test list

# List by type
mj test list --type=agent-eval

# List test suites
mj test list --suites

# List test types
mj test list --types

# Verbose output (show configuration)
mj test list --verbose

# Filter by tag
mj test list --tag=smoke

# Filter by status
mj test list --status=active
```

**Example Output:**
```
Available Tests (42):

Agent Evals (28):
  - active-members-count     [easy]      Tags: membership, kpi
  - revenue-ytd              [easy]      Tags: financial, kpi
  - trend-analysis           [medium]    Tags: analytics, trends
  - complex-aggregation      [hard]      Tags: advanced, performance

Workflow Scenarios (8):
  - customer-onboarding      [medium]    Tags: workflow, customer
  - invoice-processing       [hard]      Tags: financial, workflow

Test Suites (5):
  - smoke-tests              15 tests
  - regression-suite         42 tests
  - nightly-full            87 tests
```

### `mj test validate`

Validate test definitions without executing.

```bash
# Validate specific test
mj test validate <test-id>

# Validate all tests
mj test validate --all

# Validate by type
mj test validate --type=agent-eval

# Save validation report
mj test validate --all --save-report

# Specify output file
mj test validate --all --output=validation-report.md
```

**Example Output:**
```
Validating Tests...

✓ active-members-count
  - Configuration valid
  - Oracles registered: trace-no-errors, sql-validate, schema-validate
  - Expected outcomes defined
  - No issues found

✗ complex-aggregation
  - Configuration valid
  - Oracles registered: trace-no-errors, llm-judge
  ⚠ Warning: Missing schema validation
  ⚠ Warning: LLM judge rubric not found: 'component-quality-v2'

✓ revenue-ytd
  - Configuration valid
  - Oracles registered: trace-no-errors, sql-validate
  - Expected outcomes defined
  - No issues found

[SUMMARY] 2/3 tests valid, 1 with warnings
```

### `mj test report`

Generate test run reports.

```bash
# Generate report for recent runs
mj test report --suite=<suite-id>

# Date range
mj test report --from=2025-01-01 --to=2025-01-31

# Specific tests
mj test report --test=<test-id>

# Output formats
mj test report --format=markdown
mj test report --format=json
mj test report --format=html

# Save to file
mj test report --suite=<suite-id> --output=report.md

# Include cost analysis
mj test report --suite=<suite-id> --include-costs

# Include trends
mj test report --suite=<suite-id> --include-trends
```

**Example Markdown Output:**
```markdown
# Test Report: Agent Quality Suite
Generated: 2025-01-09 14:30:00

## Summary
- **Suite:** Agent Quality Suite
- **Period:** Last 30 days
- **Total Runs:** 42
- **Success Rate:** 95.2%
- **Total Cost:** $5.28 USD
- **Avg Duration:** 28.4s

## Test Results
| Test Name              | Runs | Pass Rate | Avg Score | Avg Cost | Trend |
|------------------------|------|-----------|-----------|----------|-------|
| Active Members Count   | 42   | 100%      | 1.0000    | $0.004   | →     |
| Revenue YTD            | 42   | 97.6%     | 0.9850    | $0.005   | ↗     |
| Complex Aggregation    | 42   | 85.7%     | 0.8200    | $0.012   | ↘     |

## Failures
2 failures in the last 30 days:

### Complex Aggregation (2025-01-08)
- **Score:** 0.6000
- **Reason:** LLM judge failed - component quality below threshold
- **Cost:** $0.012
- **Trace:** [View Agent Run](link)

## Cost Analysis
- **Total Cost:** $5.28
- **Most Expensive Test:** Complex Aggregation ($0.50)
- **Cost Trend:** +12% vs previous month

## Recommendations
- Complex Aggregation: Review LLM judge rubric threshold
- Consider caching results for Active Members Count (no failures)
```

### `mj test history`

View test execution history.

```bash
# History for specific test
mj test history <test-id>

# Recent runs
mj test history --recent=10

# By date range
mj test history --from=2025-01-01

# Filter by status
mj test history --status=failed

# Show details
mj test history <test-id> --verbose
```

### `mj test compare`

Compare test runs to detect regressions.

```bash
# Compare two specific runs
mj test compare <run-id-1> <run-id-2>

# Compare versions
mj test compare --version=2.1.0 --version=2.2.0

# Compare git commits
mj test compare --commit=abc123 --commit=def456

# Show only differences
mj test compare <run-id-1> <run-id-2> --diff-only
```

**Example Output:**
```
Comparing Test Runs:
  Run 1: 2025-01-01 (v2.1.0, commit abc123)
  Run 2: 2025-01-09 (v2.2.0, commit def456)

Test Results:
  Active Members Count:       SAME    (1.0000 → 1.0000)
  Revenue YTD:                SAME    (0.9850 → 0.9850)
  Complex Aggregation:        WORSE   (0.9200 → 0.6000) ⚠
  Trend Analysis:             BETTER  (0.7500 → 0.9100) ↗

Performance:
  Avg Duration:               BETTER  (28.4s → 24.1s) ↗
  Total Cost:                 WORSE   ($0.12 → $0.18) ⚠

Summary: 1 regression detected in Complex Aggregation
```

## Output Formats

### Console (Default)
Human-readable, color-coded output with progress indicators and emojis.

### JSON
Machine-readable for CI/CD integration:
```json
{
  "testId": "abc-123",
  "status": "passed",
  "score": 1.0,
  "duration": 1.8,
  "cost": 0.0042,
  "oracleResults": [
    {
      "type": "trace-no-errors",
      "passed": true,
      "score": 1.0,
      "message": "All 3 steps completed without errors"
    }
  ]
}
```

### Markdown
Formatted reports for documentation:
```markdown
# Test Run: Active Members Count
**Status:** PASSED ✓
**Score:** 1.0000 (100%)
**Duration:** 1.8s
**Cost:** $0.0042

## Oracle Results
- ✓ trace-no-errors: All 3 steps completed without errors
- ✓ sql-validate: COUNT(*) = 402 (expected 380-420)
- ✓ schema-validate: Output matches schema
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test-suite:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Run Smoke Tests
        run: mj test suite smoke-tests --fail-fast --format=json > results.json

      - name: Check Results
        run: |
          if ! jq -e '.passRate >= 0.95' results.json; then
            echo "Test pass rate below 95%"
            exit 1
          fi

      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: results.json
```

## Configuration

The CLI uses the standard MJ configuration file (`mj.config.cjs`):

```javascript
module.exports = {
  // Standard MJ config
  databaseSettings: { ... },

  // Testing framework config
  testing: {
    defaultEnvironment: 'dev',
    defaultFormat: 'console',
    failFast: false,
    parallel: false,
    maxParallelTests: 5,
    timeout: 300000  // 5 minutes
  }
};
```

## Error Handling

The CLI provides clear error messages with actionable guidance:

```
✗ Error: Test 'complex-aggregation' failed validation

Issues found:
  - LLM judge rubric not found: 'component-quality-v2'
  - Missing required oracle: 'schema-validate'

Suggestions:
  1. Create rubric 'component-quality-v2' or update test config
  2. Add schema-validate oracle to test configuration

Run 'mj test validate complex-aggregation --verbose' for details
```

## Future Enhancements

- [ ] Interactive mode for test creation
- [ ] Watch mode (re-run on file changes)
- [ ] Test coverage reports
- [ ] Parallel suite execution
- [ ] Result streaming for long-running tests
- [ ] Integration with MJ UI for clickable trace links
