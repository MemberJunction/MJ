import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation } from '../lint-utils';

/**
 * Rule: no-return-component
 *
 * Ensures that components don't have return statements or component references
 * at the end of the file. The component function should stand alone.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noReturnComponentRule: LintRule = {
  name: 'no-return-component',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    // Check for return statements at the program/top level
    if (ast.program && ast.program.body) {
      for (const statement of ast.program.body) {
        // Check for return statement returning the component
        if (t.isReturnStatement(statement)) {
          const argument = statement.argument;

          // Check if it's returning the component identifier or any identifier
          if (argument && t.isIdentifier(argument)) {
            // If it's returning the component name or any identifier at top level
            violations.push(
              createViolation(
                'no-return-component',
                'critical',
                statement,
                `Do not return the component at the end of the file. The component function should stand alone.`,
                `return ${argument.name};`
              )
            );
          }
        }

        // Also check for expression statements that might be standalone identifiers
        if (t.isExpressionStatement(statement) && t.isIdentifier(statement.expression) && statement.expression.name === componentName) {
          violations.push(
            createViolation(
              'no-return-component',
              'critical',
              statement,
              `Do not reference the component "${componentName}" at the end of the file. The component function should stand alone.`,
              statement.expression.name
            )
          );
        }
      }
    }

    return violations;
  },
};
