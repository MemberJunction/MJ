import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: no-use-reducer
 *
 * Prevents usage of useReducer hook in interactive components.
 * Components should manage state with useState and persist important
 * settings with onSaveUserSettings instead.
 *
 * Severity: high (pattern violation, not a functional issue)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-use-reducer')
export class NoUseReducerRule extends BaseLintRule {
  get Name() { return 'no-use-reducer'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string): Violation[] {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        if (
          (t.isIdentifier(callee) && callee.name === 'useReducer') ||
          (t.isMemberExpression(callee) &&
            t.isIdentifier(callee.object) &&
            callee.object.name === 'React' &&
            t.isIdentifier(callee.property) &&
            callee.property.name === 'useReducer')
        ) {
          violations.push({
            rule: 'no-use-reducer',
            severity: 'high', // High but not critical - it's a pattern violation
            line: path.node.loc?.start.line || 0,
            column: path.node.loc?.start.column || 0,
            message: `Component "${componentName}" uses useReducer at line ${path.node.loc?.start.line}. Components should manage state with useState and persist important settings with onSaveUserSettings.`,
            code: path.toString(),
            suggestion: {
              text: 'Use useState for state management, not useReducer',
              example: `// Instead of:
const [state, dispatch] = useReducer(reducer, initialState);

// Use useState:
function Component({ savedUserSettings, onSaveUserSettings }) {
  const [selectedId, setSelectedId] = useState(
    savedUserSettings?.selectedId
  );
  const [filters, setFilters] = useState(
    savedUserSettings?.filters || {}
  );

  // Handle actions directly
  const handleAction = (action) => {
    switch(action.type) {
      case 'SELECT':
        setSelectedId(action.payload);
        onSaveUserSettings?.({ ...savedUserSettings, selectedId: action.payload });
        break;
    }
  };
}`,
            },
          });
        }
      },
    });

    return violations;
  }
}
