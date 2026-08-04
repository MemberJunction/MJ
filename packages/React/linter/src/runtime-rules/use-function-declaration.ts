import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { traverse, NodePath, createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: use-function-declaration
 *
 * Ensures that components use function declaration syntax instead of
 * arrow functions or function expressions.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'use-function-declaration')
export class UseFunctionDeclarationRule extends BaseLintRule {
  get Name() { return 'use-function-declaration'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        // Only check TOP-LEVEL declarations (not nested inside functions)
        // This prevents flagging arrow functions inside the component
        const isTopLevel = path.getFunctionParent() === null || path.scope.path.type === 'Program';

        if (!isTopLevel) {
          return; // Skip non-top-level declarations
        }

        // Check if this is the main component being defined as arrow function
        if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
          const init = path.node.init;

          // Check if it's an arrow function
          if (t.isArrowFunctionExpression(init)) {
            violations.push(
              createViolation(
                'use-function-declaration',
                'critical',
                path.node,
                `Component "${componentName}" must be defined using function declaration syntax, not arrow function.`,
                truncateCode(path.toString(), 150),
                {
                  text: 'Use function declaration syntax for TOP-LEVEL component definitions. Arrow functions are fine inside components.',
                  example: `// ❌ WRONG - Top-level arrow function component:
const MyComponent = ({ utilities, styles, components }) => {
  const [state, setState] = useState('');

  return <div>{state}</div>;
};

// ✅ CORRECT - Function declaration for top-level:
function MyComponent({ utilities, styles, components }) {
  const [state, setState] = useState('');

  // Arrow functions are FINE inside the component:
  const handleClick = () => {
    setState('clicked');
  };

  const ChildComponent = () => <div>This is OK inside the component</div>;

  return <div onClick={handleClick}>{state}</div>;
}

// Child components also use function declaration:
function ChildComponent() {
  return <div>Child</div>;
}

// Why function declarations?
// 1. Clearer component identification
// 2. Better debugging experience (named functions)
// 3. Hoisting allows flexible code organization
// 4. Consistent with React documentation patterns
// 5. Easier to distinguish from regular variables`,
                }
              )
            );
          }
        }

        // Also check for any other TOP-LEVEL component-like arrow functions (starts with capital letter)
        // But ONLY at the top level, not inside the component
        if (t.isIdentifier(path.node.id) && /^[A-Z]/.test(path.node.id.name)) {
          const init = path.node.init;
          if (t.isArrowFunctionExpression(init)) {
            // Only flag if it's at the top level (parallel to main component)
            violations.push(
              createViolation(
                'use-function-declaration',
                'high',
                path.node,
                `Top-level component "${path.node.id.name}" should use function declaration syntax.`,
                truncateCode(path.toString(), 150),
                {
                  text: 'Use function declaration syntax for TOP-LEVEL component definitions. Arrow functions are fine inside components.',
                  example: `// ❌ WRONG - Top-level arrow function component:
const MyComponent = ({ utilities, styles, components }) => {
  const [state, setState] = useState('');

  return <div>{state}</div>;
};

// ✅ CORRECT - Function declaration for top-level:
function MyComponent({ utilities, styles, components }) {
  const [state, setState] = useState('');

  // Arrow functions are FINE inside the component:
  const handleClick = () => {
    setState('clicked');
  };

  const ChildComponent = () => <div>This is OK inside the component</div>;

  return <div onClick={handleClick}>{state}</div>;
}

// Child components also use function declaration:
function ChildComponent() {
  return <div>Child</div>;
}

// Why function declarations?
// 1. Clearer component identification
// 2. Better debugging experience (named functions)
// 3. Hoisting allows flexible code organization
// 4. Consistent with React documentation patterns
// 5. Easier to distinguish from regular variables`,
                }
              )
            );
          }
        }
      },
    });

    return violations;
    }
}
