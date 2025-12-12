import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: prop-state-sync
 *
 * Detects useEffect hooks that sync props to internal state, which creates
 * dual state management and can lead to bugs and stale state issues.
 * Components should use props directly or manage state independently.
 *
 * Severity: critical
 * Applies to: all components
 */
export const propStateSyncRule: LintRule = {
  name: 'prop-state-sync',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === 'useEffect') {
          const effectBody = path.node.arguments[0];
          const deps = path.node.arguments[1];

          if (effectBody && (t.isArrowFunctionExpression(effectBody) || t.isFunctionExpression(effectBody))) {
            const bodyString = effectBody.body.toString();

            // Check if it's setting state based on props
            const hasSetState = /set[A-Z]\w*\s*\(/.test(bodyString);
            const depsString = deps ? deps.toString() : '';

            // Check if deps include prop-like names
            const propPatterns = ['Prop', 'value', 'data', 'items'];
            const hasPropDeps = propPatterns.some((p) => depsString.includes(p));

            if (hasSetState && hasPropDeps && !bodyString.includes('async')) {
              violations.push({
                rule: 'prop-state-sync',
                severity: 'critical',
                line: path.node.loc?.start.line || 0,
                column: path.node.loc?.start.column || 0,
                message: 'Syncing props to internal state with useEffect creates dual state management',
                code: path.toString().substring(0, 100),
              });
            }
          }
        }
      },
    });

    return violations;
  },
};
