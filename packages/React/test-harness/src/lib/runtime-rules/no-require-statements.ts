import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-require-statements
 *
 * Ensures that interactive components do not use require() or dynamic import().
 * All dependencies must be passed as props.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noRequireStatementsRule: LintRule = {
  name: 'no-require-statements',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for require() calls
        if (t.isIdentifier(callee) && callee.name === 'require') {
          violations.push(
            createViolation(
              'no-require-statements',
              'critical',
              path.node,
              `Component "${componentName}" contains a require() statement. Interactive components cannot use require - all dependencies must be passed as props.`,
              truncateCode(path.toString()),
              {
                text: 'Remove all require() and dynamic import() statements. Use props instead.',
                example: `// ❌ WRONG - Using require or dynamic import:
function MyComponent({ utilities }) {
  const lodash = require('lodash');
  const module = await import('./module');

  return <div>...</div>;
}

// ✅ CORRECT - Use utilities and components props:
function MyComponent({ utilities, styles, components }) {
  // Use utilities for helper functions
  const result = utilities.debounce(() => {
    // ...
  }, 300);

  // Use components prop for child components
  const { DataTable, FilterPanel } = components;

  return (
    <div>
      <DataTable {...props} />
      <FilterPanel {...props} />
    </div>
  );
}

// Everything the component needs must be:
// - Passed via props (utilities, components, styles)
// - Available globally (React hooks)
// No module loading allowed!`,
              }
            )
          );
        }

        // Also check for dynamic import() calls
        if (t.isImport(callee)) {
          violations.push(
            createViolation(
              'no-require-statements',
              'critical',
              path.node,
              `Component "${componentName}" contains a dynamic import() statement. Interactive components cannot use dynamic imports - all dependencies must be passed as props.`,
              truncateCode(path.toString()),
              {
                text: 'Remove all require() and dynamic import() statements. Use props instead.',
                example: `// ❌ WRONG - Using require or dynamic import:
function MyComponent({ utilities }) {
  const lodash = require('lodash');
  const module = await import('./module');

  return <div>...</div>;
}

// ✅ CORRECT - Use utilities and components props:
function MyComponent({ utilities, styles, components }) {
  // Use utilities for helper functions
  const result = utilities.debounce(() => {
    // ...
  }, 300);

  // Use components prop for child components
  const { DataTable, FilterPanel } = components;

  return (
    <div>
      <DataTable {...props} />
      <FilterPanel {...props} />
    </div>
  );
}

// Everything the component needs must be:
// - Passed via props (utilities, components, styles)
// - Available globally (React hooks)
// No module loading allowed!`,
              }
            )
          );
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(noRequireStatementsRule);
