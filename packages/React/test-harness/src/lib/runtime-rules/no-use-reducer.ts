import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
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
export const noUseReducerRule: LintRule = {
  name: 'no-use-reducer',
  appliesTo: 'all',
  test: (ast, componentName) => {
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
          });
        }
      },
    });

    return violations;
  },
};
