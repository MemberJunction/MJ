# Broken Component Test Fixtures

This directory contains comprehensive test fixtures for the MemberJunction React Component Linter. Each fixture represents a specific linter rule violation to ensure the linter correctly identifies and reports issues.

## Overview

Total fixtures: **57**

These fixtures cover all major linter rules across the following categories:

## Categories

### 1. Import/Export/Require Rules (3 fixtures)
- **no-import-statements.json** - Component with ES6 import statements
- **no-export-statements.json** - Component with export statements
- **no-require-statements.json** - Component with CommonJS require statements

### 2. Component Structure Rules (7 fixtures)
- **use-function-declaration.json** - Arrow function instead of function declaration
- **no-return-component.json** - Component returning the component function itself
- **component-name-mismatch.json** - Function name doesn't match spec name
- **no-window-access.json** - Direct window object access
- **no-iife-wrapper.json** - Component wrapped in IIFE
- **single-function-only.json** - Multiple function declarations in component
- **no-data-prop.json** - Using data prop instead of savedUserSettings

### 3. React Hooks Rules (4 fixtures)
- **no-use-reducer.json** - Using useReducer instead of useState
- **react-hooks-rules.json** - Hooks called conditionally (violates rules of hooks)
- **no-react-destructuring.json** - Destructuring React object
- **saved-user-settings-pattern.json** - Not following savedUserSettings pattern

### 4. Data Access Rules (10 fixtures)
- **runview-runquery-valid-properties.json** - Accessing invalid properties on results
- **runquery-missing-categorypath.json** - RunQuery without CategoryPath
- **runquery-parameters-validation.json** - Invalid parameters passed to RunQuery
- **runview-entity-validation.json** - RunView without EntityName
- **runview-runquery-result-direct-usage.json** - Using result directly without validation
- **runquery-runview-result-structure.json** - Not checking Success before using Results
- **runquery-runview-ternary-array-check.json** - Ternary without proper array fallback
- **runquery-runview-direct-setstate.json** - Setting result object directly to state
- **runquery-runview-spread-operator.json** - Using spread on Results without validation
- **required-queries-not-called.json** - Not calling required queries from dataRequirements

### 5. Utilities Validation Rules (7 fixtures)
- **utilities-valid-properties.json** - Accessing invalid properties on utilities
- **utilities-runview-methods.json** - Calling invalid methods on utilities.rv
- **utilities-runquery-methods.json** - Calling invalid methods on utilities.rq
- **utilities-metadata-methods.json** - Calling invalid methods on utilities.md
- **utilities-ai-methods.json** - Calling invalid methods on utilities.ai
- **utilities-no-direct-instantiation.json** - Directly instantiating RunView/RunQuery
- **unsafe-formatting-methods.json** - Using unsafe formatting with user input

### 6. Component Dependency Rules (5 fixtures)
- **undefined-component-usage.json** - Using component not in dependencies
- **component-not-in-dependencies.json** - Using component without declaring dependency
- **validate-component-references.json** - Invalid component references
- **unused-component-dependencies.json** - Declared but unused dependencies
- **component-usage-without-destructuring.json** - Using components.X instead of destructuring

### 7. Callback/Event Rules (4 fixtures)
- **callbacks-usage-validation.json** - Using callbacks in non-child component
- **event-invocation-pattern.json** - Incorrect callback invocation pattern
- **callbacks-passthrough-only.json** - Child modifying callback data
- **callback-parameter-validation.json** - Invalid callback parameters

### 8. Code Style Rules (5 fixtures)
- **react-component-naming.json** - Component with lowercase name
- **string-template-validation.json** - Unescaped template literals in SQL/filters
- **unsafe-array-operations.json** - Array access without bounds checking
- **prefer-jsx-syntax.json** - Using createElement instead of JSX
- **prefer-async-await.json** - Using .then() chains instead of async/await

### 9. Additional Edge Cases (12 fixtures)
- **unused-libraries.json** - Declared but unused libraries
- **library-variable-names.json** - Wrong library variable name
- **styles-invalid-path.json** - Accessing invalid styles paths
- **styles-unsafe-access.json** - Accessing styles without optional chaining
- **noisy-settings-updates.json** - Updating settings in render (infinite loop)
- **dependency-shadowing.json** - Variable shadowing component dependency
- **undefined-jsx-component.json** - Using undefined JSX elements
- **pass-standard-props.json** - Not passing standard props to child
- **no-child-implementation.json** - Child component implementing root-only features

## Fixture Format

Each fixture is a JSON file containing a component specification:

```json
{
  "name": "ComponentName",
  "description": "Description of the violation",
  "code": "// Component code with violation",
  "componentType": "interactive" | "child",
  "libraries": [],
  "dataRequirements": [],
  "componentDependencies": []
}
```

## Usage

These fixtures can be used to:

1. **Test Linter Coverage** - Ensure all rules are working correctly
2. **Regression Testing** - Verify fixes don't break existing rules
3. **Documentation** - Provide examples of what NOT to do
4. **Training** - Help developers learn component best practices

## Running Tests

```bash
# Run all linter tests
npm test -- component-linter

# Test specific fixture
npm test -- component-linter --grep "no-import-statements"
```

## Contributing

When adding new linter rules:

1. Create a corresponding broken fixture in this directory
2. Follow the naming convention: `rule-name.json`
3. Include a clear description of the violation
4. Update this README with the new fixture

## Related Files

- **Linter Implementation**: `/packages/React/test-harness/src/lib/component-linter.ts`
- **Test Suite**: `/packages/React/test-harness/tests/component-linter.spec.ts`
- **Valid Components**: `/packages/React/component-linter-tests/fixtures/valid-components/`

## Notes

- All fixtures should trigger at least one linter violation
- Fixtures may trigger multiple violations (e.g., missing pattern + invalid syntax)
- Some rules are severity-specific (critical, high, medium, low)
- Child vs. root component rules apply different validation logic
