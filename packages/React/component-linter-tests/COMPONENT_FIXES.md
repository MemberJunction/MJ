# Component Linter Tests - Fix Guide

This document categorizes remaining lint violations and provides guidance on what needs to be fixed in the **component code** vs what may be **linter false positives** to investigate.

## Reference Files

- **Lint Rules**: `packages/React/component-linter/src/rules/` - All 81 lint rule implementations
- **Component Code**: `metadata/components/code/` - Production component JavaScript files
- **Component Specs**: `metadata/components/spec/` - Component specification JSON files
- **Test Fixtures**: `packages/React/component-linter-tests/src/fixtures/` - Test fixtures directory

## Priority 1: Critical Issues (Must Fix in Components)

### parse-error
**Issue**: JavaScript syntax errors preventing parsing
**Affected Components**: 8+ components with parse failures
**Fix**: Review and fix JavaScript syntax in these files:
- Check for unclosed brackets, missing semicolons
- Validate JSX syntax
- Ensure proper function definitions

### react-hooks-rules
**Issue**: Hooks called inside nested functions, conditionals, or loops
**Pattern to fix**:
```javascript
// ❌ Wrong - hook inside nested function
const handleClick = () => {
  const [state, setState] = useState(null); // VIOLATION
};

// ✅ Correct - hooks at component top level
const [state, setState] = useState(null);
const handleClick = () => {
  setState(newValue);
};
```

### no-child-implementation
**Issue**: Parent component implementing child component code directly
**Fix**: Ensure parent components only render child components via the `components` prop, not implement them inline

### single-function-only
**Issue**: Multiple function declarations in component file
**Fix**: Extract helper functions or combine into single component function

## Priority 2: Safety Issues (Fix in Components)

### unsafe-array-operations
**Issue**: Direct array access without bounds checking
**Current Pattern** (detected as violation):
```javascript
if (data.length > 0) {
  const field = data[0].fieldName; // Still flagged
}
```

**Safe Pattern**:
```javascript
const firstRecord = data[0];
if (firstRecord) {
  const field = firstRecord.fieldName;
}
// OR
const firstRecord = data?.[0];
if (firstRecord) { ... }
```

**Note**: The linter may need adjustment to recognize the length-check-then-access pattern as safe. For now, use the variable assignment pattern.

### unsafe-formatting-methods
**Issue**: Calling .toFixed(), .toLocaleString() without null/type checks
**Fix**:
```javascript
// ❌ Wrong
const formatted = value.toFixed(2);

// ✅ Correct
const formatted = typeof value === 'number' ? value.toFixed(2) : value;
```

### library-cleanup
**Issue**: Library resources not cleaned up in useEffect
**Fix**: Add cleanup function for Chart.js, D3, or other libraries:
```javascript
React.useEffect(() => {
  const chart = new ChartJS(ctx, config);

  return () => {
    chart.destroy(); // Cleanup
  };
}, [dependencies]);
```

## Priority 3: Potential Linter False Positives (Investigate)

These rules may be triggering incorrectly and need linter adjustments:

### component-props-validation
**Issue**: Reports props not matching spec even when they do
**Investigation**: Check if linter correctly parses destructured props with defaults
**Example**: `aggregateMethod = 'count'` should match spec default

### no-data-prop
**Issue**: Flags generic/shared components that legitimately use `data` prop
**Investigation**: This rule may not apply to SHARED component types like SimpleChart
**Consider**: Adding component type awareness to this rule

### callbacks-usage-validation
**Issue**: May not recognize all valid callback usage patterns
**Investigation**: Check if wrapper functions that call callbacks are recognized

### no-window-access
**Issue**: Flags intentional window access for features like export
**Pattern**: `window.SimpleChartExport = exportHandler;`
**Investigation**: Some window access is intentional for inter-component communication

## Components Status Summary

### Current Test Results
- **Total Valid Components**: 30
- **Passing**: 2
- **Failing**: 28

### Passing Components
- contact-interactions-timeline
- sales-performance-dashboard

### Most Common Violations in Valid Components
1. **unsafe-array-operations** - Direct array indexing without checks (most frequent)
2. **component-props-validation** - Props mismatch with spec
3. **callbacks-usage-validation** - Direct callback access in nested functions
4. **no-data-prop** - Generic 'data' prop in shared components
5. **library-cleanup** - Missing useEffect cleanup
6. **unused-libraries** - Declared but unused libraries in spec

### Components with Most Issues (10+ violations)
- accounts-by-industry-chart
- ai-prompts-cluster
- deal-pipeline-dashboard
- monthly-invoice-revenue-chart
- pipeline-forecast-chart
- product-revenue-by-category
- quarterly-revenue-trends
- simple-chart
- us-account-heatmap
- win-loss-analysis

### Need Parse Error Fixes
Review these components for JavaScript syntax errors:
- ai-prompts-cluster.js
- accounts-by-industry.js
- (and others with parse-error violations)

### Need Hook Fixes
Components with hooks in nested functions or conditionals

### Need Array Safety Fixes
- simple-chart.js (partially fixed)
- Most dashboard components with data processing

## Testing Commands

```bash
# Run all linter tests
cd packages/React/component-linter-tests
npm test

# Run tests with verbose output
npm test -- --verbose

# Run specific test file
npm test -- --grep "valid-components"
```

## Workflow for Fixing Components

1. **Start with parse errors** - Fix syntax so linting can proceed
2. **Fix react-hooks-rules** - Move hooks to component top level
3. **Fix unsafe-array-operations** - Add bounds checking
4. **Fix unsafe-formatting-methods** - Add type guards
5. **Add library cleanup** - Ensure useEffect cleanup functions
6. **Run tests** - Verify fixes resolved violations
7. **Investigate remaining** - Determine if linter needs adjustment

## Creating Linter Rule Fixes

If a rule is producing false positives:

1. **Find the rule**: `packages/React/component-linter/src/rules/{rule-name}.ts`
2. **Understand the pattern**: Read the rule's AST visitor logic
3. **Add test cases**: Create fixtures in broken-components and fixed-components
4. **Adjust detection**: Modify the rule to handle the edge case
5. **Rebuild linter**: `cd packages/React/component-linter && npm run build`
6. **Rerun tests**: Verify the fix works

## Notes

- These are **production components** used as golden examples for AI generation
- Focus on clean, safe patterns that set good examples
- When in doubt, err on the side of explicit safety checks
- Document any intentional patterns that violate rules (like window access for export)
