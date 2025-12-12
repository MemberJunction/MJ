import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { Violation } from '../component-linter';

/**
 * Rule: saved-user-settings-pattern
 *
 * Checks for improper onSaveUserSettings usage. Prevents saving ephemeral UI state
 * (hover, dropdown, modal, loading, typing, draft, expanded, collapsed, focused)
 * to savedUserSettings. Only important user preferences should be persisted.
 *
 * Severity: medium (pattern issue but not breaking)
 * Applies to: all components
 */
export const savedUserSettingsPatternRule: LintRule = {
  name: 'saved-user-settings-pattern',
  appliesTo: 'all',
  test: (ast, componentName) => {
    const violations: Violation[] = [];

    // Check for improper onSaveUserSettings usage
    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const callee = path.node.callee;

        // Check for onSaveUserSettings calls
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === 'onSaveUserSettings') {
          // Check if saving ephemeral state
          if (path.node.arguments.length > 0) {
            const arg = path.node.arguments[0];
            if (t.isObjectExpression(arg)) {
              for (const prop of arg.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const key = prop.key.name;
                  const ephemeralPatterns = ['hover', 'dropdown', 'modal', 'loading', 'typing', 'draft', 'expanded', 'collapsed', 'focused'];

                  if (ephemeralPatterns.some((pattern) => key.toLowerCase().includes(pattern))) {
                    violations.push({
                      rule: 'saved-user-settings-pattern',
                      severity: 'medium', // Pattern issue but not breaking
                      line: prop.loc?.start.line || 0,
                      column: prop.loc?.start.column || 0,
                      message: `Saving ephemeral UI state "${key}" to savedUserSettings. Only save important user preferences.`,
                    });
                  }
                }
              }
            }
          }
        }
      },
    });

    return violations;
  },
};
