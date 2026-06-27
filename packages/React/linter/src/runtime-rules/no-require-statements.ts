import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { traverse, NodePath, createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-require-statements
 *
 * Ensures that interactive components do not use require() or dynamic import().
 * All dependencies must be passed as props.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-require-statements')
export class NoRequireStatementsRule extends BaseLintRule {
  get Name() { return 'no-require-statements'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
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
  }
}
