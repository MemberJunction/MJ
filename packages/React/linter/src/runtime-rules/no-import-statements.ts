import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { traverse, NodePath, createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-import-statements
 *
 * Ensures that interactive components do not contain import statements.
 * All dependencies must be passed as props (utilities, components, styles).
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-import-statements')
export class NoImportStatementsRule extends BaseLintRule {
  get Name() { return 'no-import-statements'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        violations.push(
          createViolation(
            'no-import-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an import statement. Interactive components cannot use import statements - all dependencies must be passed as props.`,
            truncateCode(path.toString()),
            {
              text: 'Remove all import statements. Interactive components receive everything through props.',
              example: `// ❌ WRONG - Using import statements:
import React from 'react';
import { useState } from 'react';
import { format } from 'date-fns';
import './styles.css';

function MyComponent({ utilities, styles }) {
  // ...
}

// ✅ CORRECT - Everything passed as props:
function MyComponent({ utilities, styles, components }) {
  // React hooks are available globally (useState, useEffect, etc.)
  const [value, setValue] = useState('');

  // Utilities include formatting functions
  const formatted = utilities.formatDate(new Date());

  // Styles are passed as props
  return <div style={styles.container}>...</div>;
}

// All dependencies must be:
// 1. Passed through the 'utilities' prop (formatting, helpers)
// 2. Passed through the 'components' prop (child components)
// 3. Passed through the 'styles' prop (styling)
// 4. Available globally (React hooks)`,
            }
          )
        );
      },
    });

    return violations;
  }
}
