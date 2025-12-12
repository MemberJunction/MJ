import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: no-export-statements
 *
 * Ensures that interactive components do not contain export statements.
 * Components are self-contained and should not export values.
 *
 * Severity: critical
 * Applies to: all components
 */
export const noExportStatementsRule: LintRule = {
  name: 'no-export-statements',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    // Track if we're inside the main function and where it ends
    let mainFunctionEnd = 0;

    // First pass: find the main component function
    traverse(ast, {
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        if (path.node.id?.name === componentName) {
          mainFunctionEnd = path.node.loc?.end.line || 0;
          path.stop(); // Stop traversing once we find it
        }
      },
      FunctionExpression(path: NodePath<t.FunctionExpression>) {
        // Check for function expressions assigned to const/let/var
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && parent.id.name === componentName) {
          mainFunctionEnd = path.node.loc?.end.line || 0;
          path.stop();
        }
      },
      ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
        // Check for arrow functions assigned to const/let/var
        const parent = path.parent;
        if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id) && parent.id.name === componentName) {
          mainFunctionEnd = path.node.loc?.end.line || 0;
          path.stop();
        }
      },
    });

    // Second pass: check for export statements
    traverse(ast, {
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        const line = path.node.loc?.start.line || 0;
        violations.push(
          createViolation(
            'no-export-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an export statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
            truncateCode(path.toString())
          )
        );
      },
      ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
        const line = path.node.loc?.start.line || 0;
        violations.push(
          createViolation(
            'no-export-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an export default statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
            truncateCode(path.toString())
          )
        );
      },
      ExportAllDeclaration(path: NodePath<t.ExportAllDeclaration>) {
        const line = path.node.loc?.start.line || 0;
        violations.push(
          createViolation(
            'no-export-statements',
            'critical',
            path.node,
            `Component "${componentName}" contains an export * statement${mainFunctionEnd > 0 && line > mainFunctionEnd ? ' after the component function' : ''}. Interactive components are self-contained and cannot export values.`,
            truncateCode(path.toString())
          )
        );
      },
    });

    return violations;
  },
};
