import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-react-destructuring
 *
 * Ensures that components do not destructure from React.
 * React hooks are available globally and don't need to be imported or destructured.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noReactDestructuringRule: LintRule = {
  name: 'no-react-destructuring',
  appliesTo: 'all',
  test: (ast) => {
    const violations: Violation[] = [];

    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        // Check for destructuring from React
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init) && path.node.init.name === 'React') {
          // Get the destructured properties
          const destructuredProps = path.node.id.properties
            .filter((prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key))
            .map((prop) => (prop as t.ObjectProperty).key as t.Identifier)
            .map((key) => key.name);

          violations.push({
            rule: 'no-react-destructuring',
            severity: 'critical',
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `Cannot destructure from React. The hooks (${destructuredProps.join(', ')}) are already available as global functions in the React runtime.`,
            code: truncateCode(path.toString()),
            suggestion: {
              text: `Remove the destructuring statement. React hooks like ${destructuredProps.join(', ')} are already available globally and don't need to be imported or destructured.`,
              example: `// Remove this line entirely:
// const { ${destructuredProps.join(', ')} } = React;

// Just use the hooks directly:
const [state, setState] = useState(initialValue);`,
            },
          });
        }
      },
    });

    return violations;
  },
};
