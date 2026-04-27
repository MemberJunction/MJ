import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: no-data-prop
 *
 * Discourages the use of generic 'data' prop names in favor of more specific
 * names like 'items', 'customers', etc. This improves code clarity and makes
 * the component's purpose more explicit.
 *
 * Skips chart/visualization components that legitimately need generic data props.
 *
 * Severity: low (opinion-based style preference, not a functional issue)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'no-data-prop')
export class NoDataPropRule extends BaseLintRule {
  get Name() { return 'no-data-prop'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip this rule for chart/visualization components that legitimately need generic data props
    // These are reusable components designed to work with any entity type
    const isChartComponent =
      componentSpec?.type === 'chart' ||
      componentName.toLowerCase().includes('chart') ||
      componentName.toLowerCase().includes('graph') ||
      componentName.toLowerCase().includes('visualization') ||
      componentName.toLowerCase().includes('grid') ||
      componentName.toLowerCase().includes('table');

    if (isChartComponent) {
      return violations; // Skip - generic data prop is expected for chart components
    }

    traverse(ast, {
      // Check function parameters for 'data' prop
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
          const param = path.node.params[0];
          if (t.isObjectPattern(param)) {
            for (const prop of param.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'data') {
                violations.push({
                  rule: 'no-data-prop',
                  severity: 'low', // Opinion-based style preference, not a functional issue
                  line: prop.loc?.start.line || 0,
                  column: prop.loc?.start.column || 0,
                  message: `Component "${componentName}" accepts generic 'data' prop. Consider using more specific prop names like 'items', 'customers', etc. for clarity.`,
                  code: 'data prop in component signature',
                  suggestion: {
                    text: 'Replace generic data prop with specific named props',
                    example: `// Instead of:
function Component({ data, savedUserSettings, onSaveUserSettings }) {
  return <div>{data.items.map(...)}</div>;
}

// Use specific props:
function Component({ items, customers, savedUserSettings, onSaveUserSettings }) {
  // Component owns its state
  const [selectedItemId, setSelectedItemId] = useState(
    savedUserSettings?.selectedItemId
  );

  return <div>{items.map(...)}</div>;
}

// Load data using utilities:
const result = await utilities.rv.RunView({ entityName: 'Items' });`,
                  },
                });
              }
            }
          }
        }
      },

      // Also check arrow functions
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isIdentifier(path.node.id) && path.node.id.name === componentName) {
          const init = path.node.init;
          if (t.isArrowFunctionExpression(init) && init.params[0]) {
            const param = init.params[0];
            if (t.isObjectPattern(param)) {
              for (const prop of param.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'data') {
                  violations.push({
                    rule: 'no-data-prop',
                    severity: 'low', // Opinion-based style preference, not a functional issue
                    line: prop.loc?.start.line || 0,
                    column: prop.loc?.start.column || 0,
                    message: `Component "${componentName}" accepts generic 'data' prop. Consider using more specific prop names like 'items', 'customers', etc. for clarity.`,
                    code: 'data prop in component signature',
                  });
                }
              }
            }
          }
        }
      },
    });

    return violations;
  }
}
