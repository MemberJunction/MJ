# Library Lint Rule Specification v2

## Overview
Library-specific lint rules combine metadata-driven checks with executable validation functions to provide comprehensive linting for third-party libraries.

## Structure

```typescript
interface LibraryLintRules {
  // Metadata for standard checks
  initialization?: {
    constructorName?: string;
    requiresNew?: boolean;
    elementType?: string;
    requiredConfig?: string[];
    factoryMethod?: string;
  };
  
  lifecycle?: {
    requiredMethods?: string[];
    cleanupMethods?: string[];
    updateMethods?: string[];
  };
  
  // Executable validation functions
  validators?: {
    [ruleName: string]: {
      description: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      // Function as string that will be evaluated
      // Must return null if valid, or Violation object if invalid
      validate: string; // "(ast, path, t) => Violation | null"
    };
  };
  
  // Pattern-based checks with code
  patterns?: {
    [patternName: string]: {
      description: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      // AST visitor pattern
      visitor: string; // "{ CallExpression(path) { ... } }"
    };
  };
}
```

## Validation Function Signature

All validation functions receive:
- `ast`: The full AST (t.File)
- `path`: Current NodePath being validated
- `t`: Babel types object
- `context`: Additional context object with:
  - `libraryName`: Name of the library
  - `globalVariable`: Global variable name
  - `instanceVariables`: Set of identified instance variable names

Returns:
- `null` if validation passes
- `Violation` object if validation fails:
  ```typescript
  {
    rule: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    line?: number;
    column?: number;
    fix?: string;
  }
  ```

## Example Validation Functions

### Chart.js - Check for destroy before recreate
```javascript
"validateChartDestroy": {
  "description": "Check that Chart instances are destroyed before recreating",
  "severity": "critical",
  "validate": "(ast, path, t, context) => {
    if (t.isNewExpression(path.node) && 
        t.isIdentifier(path.node.callee) && 
        path.node.callee.name === 'Chart') {
      
      const canvasArg = path.node.arguments[0];
      if (!canvasArg) return null;
      
      // Look for Chart.getChart() check before new Chart()
      let hasCheck = false;
      let currentPath = path.parentPath;
      while (currentPath && !hasCheck) {
        if (t.isIfStatement(currentPath.node)) {
          const test = currentPath.node.test;
          if (t.isCallExpression(test) && 
              t.isMemberExpression(test.callee) &&
              t.isIdentifier(test.callee.object) &&
              test.callee.object.name === 'Chart' &&
              t.isIdentifier(test.callee.property) &&
              test.callee.property.name === 'getChart') {
            hasCheck = true;
          }
        }
        currentPath = currentPath.parentPath;
      }
      
      if (!hasCheck) {
        return {
          rule: 'chart-destroy-check',
          severity: 'critical',
          message: 'Chart.js: Always check for existing chart with Chart.getChart() and destroy it before creating a new one',
          line: path.node.loc?.start.line || 0,
          column: path.node.loc?.start.column || 0,
          fix: 'const existingChart = Chart.getChart(canvasRef.current);\\nif (existingChart) {\\n  existingChart.destroy();\\n}'
        };
      }
    }
    return null;
  }"
}
```

## Implementation in Linter

The linter will:
1. Parse the JSON lint rules
2. For validators, use `new Function()` to create executable functions
3. For patterns, create Babel visitors
4. Execute these during AST traversal
5. Collect and return violations