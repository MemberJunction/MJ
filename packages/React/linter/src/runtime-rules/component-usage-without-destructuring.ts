import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: component-usage-without-destructuring
 *
 * Detects when a component dependency is used directly in JSX without first
 * being destructured from the components prop. Components must either be
 * destructured or accessed via components.Name syntax.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'component-usage-without-destructuring')
export class ComponentUsageWithoutDestructuringRule extends BaseLintRule {
  get Name() { return 'component-usage-without-destructuring'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip if no dependencies
    if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
      return violations;
    }

    // Track dependency names
    const dependencyNames = new Set(componentSpec.dependencies.map((d) => d.name).filter(Boolean));

    // Track what's been destructured from components prop
    const destructuredComponents = new Set<string>();

    traverse(ast, {
      // Track destructuring from components
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (t.isObjectPattern(path.node.id) && t.isIdentifier(path.node.init)) {
          // Check if destructuring from 'components'
          if (path.node.init.name === 'components') {
            for (const prop of path.node.id.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                const name = prop.key.name;
                if (dependencyNames.has(name)) {
                  destructuredComponents.add(name);
                }
              }
            }
          }
        }
      },

      // Also check function parameter destructuring
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id && path.node.id.name === componentName && path.node.params[0]) {
          const param = path.node.params[0];
          if (t.isObjectPattern(param)) {
            for (const prop of param.properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'components') {
                // Check for nested destructuring like { components: { A, B } }
                if (t.isObjectPattern(prop.value)) {
                  for (const innerProp of prop.value.properties) {
                    if (t.isObjectProperty(innerProp) && t.isIdentifier(innerProp.key)) {
                      const name = innerProp.key.name;
                      if (dependencyNames.has(name)) {
                        destructuredComponents.add(name);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },

      // Check JSX usage
      JSXElement(path: NodePath<t.JSXElement>) {
        const openingElement = path.node.openingElement;

        // Check for direct component usage (e.g., <ComponentName>)
        if (t.isJSXIdentifier(openingElement.name)) {
          const name = openingElement.name.name;

          // Check if this is one of our dependencies being used directly
          if (dependencyNames.has(name) && !destructuredComponents.has(name)) {
            violations.push({
              rule: 'component-usage-without-destructuring',
              severity: 'critical',
              line: openingElement.loc?.start.line || 0,
              column: openingElement.loc?.start.column || 0,
              message: `Component "${name}" used without destructuring. Either destructure it from components prop (const { ${name} } = components;) or use <components.${name} />`,
              code: `<${name}>`,
              suggestion: {
                text: 'Components must be properly accessed - either destructure from components prop or use dot notation',
                example: `// ❌ WRONG - Using component without destructuring:
function MyComponent({ components }) {
  return <AccountList />; // Error: AccountList not destructured
}

// ✅ CORRECT - Option 1: Destructure from components
function MyComponent({ components }) {
  const { AccountList } = components;
  return <AccountList />;
}

// ✅ CORRECT - Option 2: Use dot notation
function MyComponent({ components }) {
  return <components.AccountList />;
}

// ✅ CORRECT - Option 3: Destructure in function parameters
function MyComponent({ components: { AccountList } }) {
  return <AccountList />;
}`,
              },
            });
          }
        }
      },
    });

    return violations;
  }
}
