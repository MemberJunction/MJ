# React Test Harness Linter Session Summary

## Session Date: 2025-09-03

## Project Context
Working on MemberJunction's React Test Harness component linting and execution system. The test harness validates and executes React components in an isolated browser environment using Playwright.

## Recent Work Completed

### 1. Fixed AG-Grid Lint Rule Detection
- **Issue**: Library-specific lint rules (like AG-Grid) weren't triggering
- **Root Cause**: `contextUser` was required but not always provided
- **Fix**: 
  - Removed contextUser requirement for applying library lint rules
  - Added proper error handling when contextUser is missing but required
  - Fixed validator execution to handle both return and push patterns for violations

### 2. Improved Library Lint Console Output
- Added hierarchical, visual console output for library-specific checks
- Shows specific validator names being executed (e.g., "🔬 Running ag-grid-react validator: checkComponentAccess")
- Better organization with tree-like structure using box-drawing characters

### 3. Component Execution Runtime Error Investigation
- **Current Issue**: "Cannot read properties of null (reading 'useEffect')" error occurring 4 times
- **Misleading Error**: Shows as "Invalid JSX element type: React received an object" but real issue is React is null
- **Discovery**: React hooks ARE properly passed to component factory functions in the runtime
- **Code Location**: `/packages/React/runtime/src/compiler/component-compiler.ts` lines 717-718, 736-738

## Current Investigation - React Null Issue

### What We Found
The component factory IS created correctly with hooks as parameters:
```javascript
const factoryCreator = new Function(
  'React', 'ReactDOM',
  'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
  ...
)
```

Then called with:
```javascript
React.useState, React.useEffect, React.useCallback, ...
```

### Diagnostic Code Added (NOT COMMITTED)
Added diagnostic logging to identify when/why React becomes null:

1. **component-runner.ts** (lines 259-274): Checks React availability before creating runtimeContext
2. **component-compiler.ts** (lines 726-740, 748-777): Checks React when creating factory and wraps in try-catch

### Test Component With Issue
```javascript
function AccountsByIndustryPieChart({...}) {
  const [isLoading, setIsLoading] = useState(loading); // Error here
  const [chartData, setChartData] = useState([]);
  const chartDivRef = useRef(null);
  const chartInstanceRef = useRef(null);
  // ... rest of component
}
```

## Files Modified (Status)

### Committed Files
- `/packages/React/test-harness/src/lib/component-linter.ts` - Fixed library lint rules
- `/packages/React/test-harness/src/lib/library-lint-cache.ts` - Added test support
- `/packages/React/test-harness/src/lib/test-harness.ts` - Added contextUser validation

### Files with Diagnostic Code (NOT COMMITTED)
- `/packages/React/test-harness/src/lib/component-runner.ts` - React null diagnostics
- `/packages/React/runtime/src/compiler/component-compiler.ts` - Factory creation diagnostics

## Key Discoveries

1. **React Hooks ARE Properly Provided**: The runtime correctly passes useState, useEffect, etc. as separate parameters to components
2. **The Real Issue**: React object itself is becoming null at runtime, not a hook destructuring issue
3. **Error Occurs 4 Times**: Suggests multiple hooks trying to access null React (useState, useEffect, useRef, useMemo)

## Next Steps

1. Run test with diagnostic code to identify exactly when React becomes null
2. Check if it's a timing issue, race condition, or React being overwritten
3. Potentially need to ensure React persists throughout component lifecycle

## Important Code Locations

- **Component Factory Creation**: `/packages/React/runtime/src/compiler/component-compiler.ts:708-780`
- **Runtime Context Creation**: `/packages/React/test-harness/src/lib/component-runner.ts:255-280`
- **Library Lint Rules**: `/metadata/component-libraries/lint-rules/`
- **AG-Grid Specific Rule**: `/metadata/component-libraries/lint-rules/ag-grid-react/check-component-access.js`

## Branch
Working on: `an-dev-agents-2`

## PR
PR #1370 - "Enhancements to React Test Harness Linting and Error Handling"

## Commands to Resume
```bash
# To test with diagnostic code
npm run build  # in test-harness
cd ../runtime && npm run build  # in runtime

# Then run your test that's showing the error
```

## Notes
- addTestLibraryRules() method added for testing without DB access (not used in production)
- All library validators return violation objects which are properly handled
- Context user is now required when components have library dependencies