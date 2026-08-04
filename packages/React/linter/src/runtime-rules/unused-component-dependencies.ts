import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: unused-component-dependencies
 *
 * Detects declared embedded component dependencies that are not used in the component code.
 * Checks for various usage patterns including JSX, dot notation, and bracket notation.
 *
 * Severity: low
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'unused-component-dependencies')
export class UnusedComponentDependenciesRule extends BaseLintRule {
  get Name() { return 'unused-component-dependencies'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip if no dependencies declared
    if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
      return violations;
    }

    // Filter to only embedded components
    const embeddedDeps = componentSpec.dependencies.filter((dep) => dep.location === 'embedded' && dep.name);

    if (embeddedDeps.length === 0) {
      return violations;
    }

    // Get the function body to search within
    let functionBody: string = '';
    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id && path.node.id.name === componentName) {
          functionBody = path.toString();
        }
      },
    });

    // If we couldn't find the function body, use the whole code
    if (!functionBody) {
      functionBody = ast.toString ? ast.toString() : '';
    }

    // Check each component dependency for usage
    for (const dep of embeddedDeps) {
      const depName = dep.name!;

      // Check for various usage patterns
      // Components can be used directly (if destructured) or via components object
      const usagePatterns = [
        // Direct usage (after destructuring)
        '<' + depName + ' ', // JSX: <AccountList />
        '<' + depName + '>', // JSX: <AccountList>
        '<' + depName + '/', // JSX self-closing: <AccountList/>
        depName + '(', // Direct call: AccountList()
        '= ' + depName, // Assignment: const List = AccountList
        depName + ' ||', // Fallback: AccountList || DefaultComponent
        depName + ' &&', // Conditional: AccountList && ...
        depName + ' ?', // Ternary: AccountList ? ... : ...
        ', ' + depName, // In parameter/array list
        '(' + depName, // Start of expression
        '{' + depName, // In object literal

        // Via components object
        'components.' + depName, // Dot notation: components.AccountList
        "components['" + depName + "']", // Bracket notation single quotes
        'components["' + depName + '"]', // Bracket notation double quotes
        'components[`' + depName + '`]', // Bracket notation template literal
        '<components.' + depName, // JSX via components: <components.AccountList
      ];

      const isUsed = usagePatterns.some((pattern) => functionBody.includes(pattern));

      if (!isUsed) {
        violations.push({
          rule: 'unused-component-dependencies',
          severity: 'low',
          line: 1,
          column: 0,
          message: `Component dependency "${depName}" is declared but never used. Consider removing it if not needed.`,
          code: `Expected usage: <${depName} /> or <components.${depName} />`,
        });
      }
    }

    return violations;
  }
}
