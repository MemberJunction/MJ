import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: component-name-mismatch
 *
 * Ensures that the component function name matches the name specified in the ComponentSpec.
 * The function name must match exactly, including capitalization.
 *
 * Severity: critical
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'component-name-mismatch')
export class ComponentNameMismatchRule extends BaseLintRule {
  get Name() { return 'component-name-mismatch'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // The expected component name from the spec
    const expectedName = componentSpec?.name || componentName;

    // Find the main function declaration
    let foundMainFunction = false;

    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        // Only check top-level function declarations
        if (path.parent === ast.program && path.node.id) {
          const funcName = path.node.id.name;

          // Check if this looks like the main component function
          // (starts with capital letter and has the typical props parameter)
          if (/^[A-Z]/.test(funcName)) {
            foundMainFunction = true;

            // Check if the function name matches the spec name
            if (funcName !== expectedName) {
              violations.push({
                rule: 'component-name-mismatch',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Component function name "${funcName}" does not match the spec name "${expectedName}". The function must be named exactly as specified in the component spec. Rename the function to: function ${expectedName}(...)`,
                code: `function ${funcName}(...)`,
              });
            }

            // Also check that the first letter case matches
            const expectedFirstChar = expectedName.charAt(0);
            const actualFirstChar = funcName.charAt(0);
            if (expectedFirstChar !== actualFirstChar && expectedName.toLowerCase() === funcName.toLowerCase()) {
              violations.push({
                rule: 'component-name-mismatch',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: `Component function name "${funcName}" has incorrect capitalization. Expected "${expectedName}" (note the case of the first letter). The function name must match exactly, including capitalization: function ${expectedName}(...)`,
                code: `function ${funcName}(...)`,
              });
            }
          }
        }
      },
    });

    // If we didn't find a main function with the expected name
    if (!foundMainFunction && componentSpec?.name) {
      violations.push({
        rule: 'component-name-mismatch',
        severity: 'critical',
        line: 1,
        column: 0,
        message: `No function declaration found with the expected name "${expectedName}". The main component function must be named exactly as specified in the spec. Add a function declaration: function ${expectedName}({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) { ... }`,
      });
    }

    return violations;
  }
}
