import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { traverse, NodePath, createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-export-statements
 *
 * Ensures that interactive components do not contain export statements.
 * Components are self-contained and should not export values.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-export-statements')
export class NoExportStatementsRule extends BaseLintRule {
  get Name() { return 'no-export-statements'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    // Track if we're inside the main function and where it ends
    let mainFunctionEnd = 0;

    // First pass: find the main component function
    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id?.name === componentName) {
          mainFunctionEnd = path.node.loc?.end.line || 0;
          path.stop(); // Stop traversing once we find it
        }
      },
      FunctionExpression(path: NodePath<t.FunctionExpression>) {
        // Check for function expressions assigned to const/let/var
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && parent.id.name === componentName) {
          mainFunctionEnd = path.node.loc?.end.line || 0;
          path.stop();
        }
      },
      ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
        // Check for arrow functions assigned to const/let/var
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && parent.id.name === componentName) {
          mainFunctionEnd = path.node.loc?.end.line || 0;
          path.stop();
        }
      },
    });

    // Second pass: check for export statements
    traverse(ast, {
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        const line = path.node.loc?.start.line || 0;
        violations.push(
          createViolation(
            'no-export-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an export statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
            truncateCode(path.toString()),
            {
              text: 'Remove all export statements. The component function should be the only code, not exported.',
              example: `// ❌ WRONG - Using export:
export function MyComponent({ utilities }) {
  return <div>Hello</div>;
}

export const helper = () => {};
export default MyComponent;

// ✅ CORRECT - Just the function, no exports:
function MyComponent({ utilities, styles, components }) {
  // Helper functions defined inside if needed
  const helper = () => {
    // ...
  };

  return <div>Hello</div>;
}

// The component is self-contained.
// No exports needed - the host environment
// will execute the function directly.`,
            }
          )
        );
      },
      ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
        const line = path.node.loc?.start.line || 0;
        violations.push(
          createViolation(
            'no-export-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an export default statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
            truncateCode(path.toString()),
            {
              text: 'Remove all export statements. The component function should be the only code, not exported.',
              example: `// ❌ WRONG - Using export:
export function MyComponent({ utilities }) {
  return <div>Hello</div>;
}

export const helper = () => {};
export default MyComponent;

// ✅ CORRECT - Just the function, no exports:
function MyComponent({ utilities, styles, components }) {
  // Helper functions defined inside if needed
  const helper = () => {
    // ...
  };

  return <div>Hello</div>;
}

// The component is self-contained.
// No exports needed - the host environment
// will execute the function directly.`,
            }
          )
        );
      },
      ExportAllDeclaration(path: NodePath<t.ExportAllDeclaration>) {
        const line = path.node.loc?.start.line || 0;
        violations.push(
          createViolation(
            'no-export-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an export * statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
            truncateCode(path.toString()),
            {
              text: 'Remove all export statements. The component function should be the only code, not exported.',
              example: `// ❌ WRONG - Using export:
export function MyComponent({ utilities }) {
  return <div>Hello</div>;
}

export const helper = () => {};
export default MyComponent;

// ✅ CORRECT - Just the function, no exports:
function MyComponent({ utilities, styles, components }) {
  // Helper functions defined inside if needed
  const helper = () => {
    // ...
  };

  return <div>Hello</div>;
}

// The component is self-contained.
// No exports needed - the host environment
// will execute the function directly.`,
            }
          )
        );
      },
    });

    return violations;
  }
}
