import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: unused-libraries
 *
 * Detects declared libraries that are not used in the component code.
 * Libraries declared in the component spec should be referenced in the code.
 *
 * Severity: critical (none used), high/low (some unused)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'unused-libraries')
export class UnusedLibrariesRule extends BaseLintRule {
  get Name() { return 'unused-libraries'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip if no libraries declared
    if (!componentSpec?.libraries || componentSpec.libraries.length === 0) {
      return violations;
    }

    // Get the function body to search within — include root AND child component code
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

    // Also include child component code — libraries declared on the root spec
    // may be used by child components in multi-component trees
    if (componentSpec?.dependencies) {
      for (const dep of componentSpec.dependencies) {
        if (dep.code) {
          functionBody += '\n' + dep.code;
        }
        // Include grandchildren too
        if (dep.dependencies) {
          for (const grandchild of dep.dependencies) {
            if (grandchild.code) {
              functionBody += '\n' + grandchild.code;
            }
          }
        }
      }
    }

    // Track which libraries are used and unused
    const unusedLibraries: Array<{ name: string; globalVariable: string }> = [];
    const usedLibraries: Array<{ name: string; globalVariable: string }> = [];

    // Check each library for usage
    for (const lib of componentSpec.libraries) {
      const globalVar = lib.globalVariable;
      if (!globalVar) continue;

      // Check for various usage patterns
      const usagePatterns = [
        globalVar + '.', // Direct property access: Chart.defaults
        globalVar + '(', // Direct call: dayjs()
        'new ' + globalVar + '(', // Constructor: new Chart()
        globalVar + '[', // Array/property access: XLSX['utils']
        '= ' + globalVar, // Assignment: const myChart = Chart
        ', ' + globalVar, // In parameter list
        '(' + globalVar, // Start of expression
        '{' + globalVar, // In object literal
        '<' + globalVar, // JSX component
        globalVar + ' ', // Followed by space (various uses)
        'unwrapLibraryComponents(' + globalVar, // unwrapLibraryComponents(antd, ...)
        'unwrapLibraryComponents( ' + globalVar, // unwrapLibraryComponents( antd, ...)
      ];

      const isUsed = usagePatterns.some((pattern) => functionBody.includes(pattern));

      if (isUsed) {
        usedLibraries.push({ name: lib.name, globalVariable: globalVar });
      } else {
        unusedLibraries.push({ name: lib.name, globalVariable: globalVar });
      }
    }

    // Determine severity based on usage patterns
    const totalLibraries = componentSpec.libraries.length;
    const usedCount = usedLibraries.length;

    if (usedCount === 0 && totalLibraries > 0) {
      // CRITICAL: No libraries used at all
      violations.push({
        rule: 'unused-libraries',
        severity: 'critical',
        line: 1,
        column: 0,
        message: `CRITICAL: None of the ${totalLibraries} declared libraries are used. This indicates missing core functionality.`,
        code: `Unused libraries: ${unusedLibraries.map((l) => l.name).join(', ')}`,
      });
    } else if (unusedLibraries.length > 0) {
      // Some libraries unused, severity depends on ratio
      for (const lib of unusedLibraries) {
        const severity = totalLibraries === 1 ? 'high' : 'low';
        const contextMessage =
          totalLibraries === 1
            ? "This is the only declared library and it's not being used."
            : `${usedCount} of ${totalLibraries} libraries are being used. This might be an alternative/optional library.`;

        violations.push({
          rule: 'unused-libraries',
          severity: severity,
          line: 1,
          column: 0,
          message: `Library "${lib.name}" (${lib.globalVariable}) is declared but not used. ${contextMessage}`,
          code: `Consider removing if not needed: { name: "${lib.name}", globalVariable: "${lib.globalVariable}" }`,
        });
      }
    }

    return violations;
  }
}
