import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation } from '../lint-utils';

/**
 * Rule: no-iife-wrapper
 *
 * Ensures that component code is not wrapped in an IIFE (Immediately Invoked Function Expression).
 * Components should be defined as plain functions.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-iife-wrapper')
export class NoIifeWrapperRule extends BaseLintRule {
  get Name() { return 'no-iife-wrapper'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File): Violation[] {
    const violations: Violation[] = [];

    // Check if the entire code is wrapped in an IIFE
    if (ast.program && ast.program.body) {
      for (const statement of ast.program.body) {
        // Check for IIFE pattern: (function() { ... })() or (function() { ... }())
        if (t.isExpressionStatement(statement)) {
          const expr = statement.expression;

          // Pattern 1: (function() { ... })()
          if (t.isCallExpression(expr)) {
            const callee = expr.callee;

            // Check if calling a function expression wrapped in parentheses
            if (t.isParenthesizedExpression && t.isParenthesizedExpression(callee)) {
              const inner = callee.expression;
              if (t.isFunctionExpression(inner) || t.isArrowFunctionExpression(inner)) {
                violations.push(
                  createViolation(
                    'no-iife-wrapper',
                    'critical',
                    statement,
                    `Component code must not be wrapped in an IIFE (Immediately Invoked Function Expression). Define the component function directly.`,
                    statement.toString().substring(0, 50) + '...',
                    {
                      text: 'Remove the IIFE wrapper. Component code should be plain functions, not wrapped in immediately invoked functions.',
                      example: `// ❌ WRONG - IIFE wrapper patterns:
(function() {
  function MyComponent({ utilities, styles, components }) {
    return <div>Hello</div>;
  }
  return MyComponent;
})();

// Also wrong:
(function() {
  const MyComponent = ({ utilities }) => {
    return <div>Hello</div>;
  };
})();

// Also wrong - arrow function IIFE:
(() => {
  function MyComponent({ utilities }) {
    return <div>Hello</div>;
  }
})();

// ✅ CORRECT - Direct function declaration:
function MyComponent({ utilities, styles, components }) {
  return <div>Hello</div>;
}

// Why no IIFE?
// 1. Components run in their own scope already
// 2. The runtime handles isolation
// 3. IIFEs prevent proper component discovery
// 4. Makes debugging harder
// 5. Unnecessary complexity`,
                    }
                  )
                );
              }
            }

            // Also check without ParenthesizedExpression (some parsers handle it differently)
            if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
              violations.push(
                createViolation(
                  'no-iife-wrapper',
                  'critical',
                  statement,
                  `Component code must not be wrapped in an IIFE. Define the component function directly.`,
                  statement.toString().substring(0, 50) + '...',
                  {
                    text: 'Remove the IIFE wrapper. Component code should be plain functions, not wrapped in immediately invoked functions.',
                    example: `// ❌ WRONG - IIFE wrapper patterns:
(function() {
  function MyComponent({ utilities, styles, components }) {
    return <div>Hello</div>;
  }
  return MyComponent;
})();

// Also wrong:
(function() {
  const MyComponent = ({ utilities }) => {
    return <div>Hello</div>;
  };
})();

// Also wrong - arrow function IIFE:
(() => {
  function MyComponent({ utilities }) {
    return <div>Hello</div>;
  }
})();

// ✅ CORRECT - Direct function declaration:
function MyComponent({ utilities, styles, components }) {
  return <div>Hello</div>;
}

// Why no IIFE?
// 1. Components run in their own scope already
// 2. The runtime handles isolation
// 3. IIFEs prevent proper component discovery
// 4. Makes debugging harder
// 5. Unnecessary complexity`,
                  }
                )
              );
            }
          }

          // Pattern 2: (function() { ... }())
          if (t.isParenthesizedExpression && t.isParenthesizedExpression(expr)) {
            const inner = expr.expression;
            if (t.isCallExpression(inner)) {
              const callee = inner.callee;
              if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
                violations.push(
                  createViolation(
                    'no-iife-wrapper',
                    'critical',
                    statement,
                    `Component code must not be wrapped in an IIFE. Define the component function directly.`,
                    statement.toString().substring(0, 50) + '...',
                    {
                      text: 'Remove the IIFE wrapper. Component code should be plain functions, not wrapped in immediately invoked functions.',
                      example: `// ❌ WRONG - IIFE wrapper patterns:
(function() {
  function MyComponent({ utilities, styles, components }) {
    return <div>Hello</div>;
  }
  return MyComponent;
})();

// Also wrong:
(function() {
  const MyComponent = ({ utilities }) => {
    return <div>Hello</div>;
  };
})();

// Also wrong - arrow function IIFE:
(() => {
  function MyComponent({ utilities }) {
    return <div>Hello</div>;
  }
})();

// ✅ CORRECT - Direct function declaration:
function MyComponent({ utilities, styles, components }) {
  return <div>Hello</div>;
}

// Why no IIFE?
// 1. Components run in their own scope already
// 2. The runtime handles isolation
// 3. IIFEs prevent proper component discovery
// 4. Makes debugging harder
// 5. Unnecessary complexity`,
                    }
                  )
                );
              }
            }
          }
        }

        // Also check for variable assignment with IIFE
        if (t.isVariableDeclaration(statement)) {
          for (const decl of statement.declarations) {
            if (decl.init && t.isCallExpression(decl.init)) {
              const callee = decl.init.callee;
              if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
                violations.push(
                  createViolation(
                    'no-iife-wrapper',
                    'critical',
                    decl,
                    `Do not use IIFE pattern for component initialization. Define components as plain functions.`,
                    decl.toString().substring(0, 50) + '...',
                    {
                      text: 'Remove the IIFE wrapper. Component code should be plain functions, not wrapped in immediately invoked functions.',
                      example: `// ❌ WRONG - IIFE wrapper patterns:
(function() {
  function MyComponent({ utilities, styles, components }) {
    return <div>Hello</div>;
  }
  return MyComponent;
})();

// Also wrong:
(function() {
  const MyComponent = ({ utilities }) => {
    return <div>Hello</div>;
  };
})();

// Also wrong - arrow function IIFE:
(() => {
  function MyComponent({ utilities }) {
    return <div>Hello</div>;
  }
})();

// ✅ CORRECT - Direct function declaration:
function MyComponent({ utilities, styles, components }) {
  return <div>Hello</div>;
}

// Why no IIFE?
// 1. Components run in their own scope already
// 2. The runtime handles isolation
// 3. IIFEs prevent proper component discovery
// 4. Makes debugging harder
// 5. Unnecessary complexity`,
                    }
                  )
                );
              }
            }
          }
        }
      }
    }

    return violations;
  }
}
