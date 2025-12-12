import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation } from '../lint-utils';

/**
 * Rule: single-function-only
 *
 * Ensures that the component code contains exactly one function declaration
 * and no other code at the top level.
 *
 * Severity: critical
 * Applies to: all components
 */
export const singleFunctionOnlyRule: LintRule = {
  name: 'single-function-only',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    // Check that the AST body contains exactly one statement and it's a function declaration
    const programBody = ast.program.body;

    // First, check if there's anything other than a single function declaration
    if (programBody.length === 0) {
      violations.push(
        createViolation(
          'single-function-only',
          'critical',
          null,
          `Component code must contain exactly one function declaration named "${componentName}". No code found.`,
          `Add: function ${componentName}({ utilities, styles, components, callbacks, savedUserSettings, onSaveUserSettings }) { ... }`
        )
      );
      return violations;
    }

    if (programBody.length > 1) {
      // Multiple top-level statements - not allowed
      violations.push(
        createViolation(
          'single-function-only',
          'critical',
          programBody[1],
          `Component code must contain ONLY a single function declaration. Found ${programBody.length} top-level statements. No code should exist before or after the function.`,
          `Remove all code except: function ${componentName}(...) { ... }`
        )
      );

      // Report each extra statement
      for (let i = 1; i < programBody.length; i++) {
        const stmt = programBody[i];
        let stmtType = 'statement';
        if (t.isVariableDeclaration(stmt)) {
          stmtType = 'variable declaration';
        } else if (t.isFunctionDeclaration(stmt)) {
          stmtType = 'function declaration';
        } else if (t.isExpressionStatement(stmt)) {
          stmtType = 'expression';
        }

        violations.push(
          createViolation(
            'single-function-only',
            'critical',
            stmt,
            `Extra ${stmtType} not allowed. Only the component function should exist.`,
            ''
          )
        );
      }
    }

    // Check that the single statement is a function declaration (not arrow function or other)
    const firstStatement = programBody[0];

    if (!t.isFunctionDeclaration(firstStatement)) {
      let actualType = 'unknown statement';
      let suggestion = '';

      if (t.isVariableDeclaration(firstStatement)) {
        // Check if it's an arrow function or other variable
        const declarator = firstStatement.declarations[0];
        if (t.isVariableDeclarator(declarator)) {
          if (t.isArrowFunctionExpression(declarator.init) || t.isFunctionExpression(declarator.init)) {
            actualType = 'arrow function or function expression';
            suggestion = `Use function declaration syntax: function ${componentName}(...) { ... }`;
          } else {
            actualType = 'variable declaration';
            suggestion = 'Remove this variable and ensure only the component function exists';
          }
        }
      } else if (t.isExpressionStatement(firstStatement)) {
        actualType = 'expression statement';
        suggestion = 'Remove this expression and add the component function';
      }

      violations.push(
        createViolation(
          'single-function-only',
          'critical',
          firstStatement,
          `Component must be a function declaration, not ${actualType}. ${suggestion}`,
          ''
        )
      );

      // Don't check name if it's not a function declaration
      return violations;
    }

    // Check that the function name matches the component name
    const functionName = firstStatement.id?.name;
    if (functionName !== componentName) {
      violations.push(
        createViolation(
          'single-function-only',
          'critical',
          firstStatement,
          `Component function name "${functionName}" does not match component name "${componentName}". The function must be named exactly as specified.`,
          `Rename to: function ${componentName}(...)`
        )
      );
    }

    // Additional check: look for any code before the function that might have been missed
    // (e.g., leading variable declarations that destructure from React)
    if (programBody.length === 1 && t.isFunctionDeclaration(firstStatement)) {
      // Use traverse to find any problematic patterns inside
      traverse(ast, {
        Program(path: NodePath<t.Program>) {
          // Check if there are any directives or other non-obvious code
          if (path.node.directives && path.node.directives.length > 0) {
            violations.push(
              createViolation(
                'single-function-only',
                'high',
                null,
                'Component should not have directives like "use strict". These are added automatically.',
                ''
              )
            );
          }
        },
      });
    }

    return violations;
  },
};
