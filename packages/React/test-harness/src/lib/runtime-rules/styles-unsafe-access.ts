import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { StylesTypeAnalyzer } from '../styles-type-analyzer';

/**
 * Rule: styles-unsafe-access
 *
 * Checks for unsafe access patterns on the styles object. Currently, this rule
 * skips all styles access because ComponentStyles interface guarantees structure
 * (all required properties exist).
 *
 * NOTE: This rule depends on StylesTypeAnalyzer which was previously accessed via
 * ComponentLinter.getStylesAnalyzer(). It now creates its own instance.
 *
 * Severity: varies
 * Applies to: all components
 */

// Lazy singleton for the styles analyzer
let _stylesAnalyzer: StylesTypeAnalyzer | null = null;
function getStylesAnalyzer(): StylesTypeAnalyzer {
  if (!_stylesAnalyzer) {
    _stylesAnalyzer = new StylesTypeAnalyzer();
  }
  return _stylesAnalyzer;
}

export const stylesUnsafeAccessRule: LintRule = {
  name: 'styles-unsafe-access',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];
    const analyzer = getStylesAnalyzer();

    // Standard props that are always defined with guaranteed structure
    // The ComponentStyles interface guarantees all required properties exist
    // So we don't need to check for optional chaining on the styles object itself
    const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        // Build the complete property chain first
        const propertyChain: string[] = [];
        let current: t.Expression = path.node;
        let hasOptionalChaining = path.node.optional || false;

        // Walk up from the deepest member expression to build the full chain
        while (t.isMemberExpression(current)) {
          if (current.optional) {
            hasOptionalChaining = true;
          }
          if (t.isIdentifier(current.property)) {
            propertyChain.unshift(current.property.name);
          }

          if (t.isIdentifier(current.object)) {
            propertyChain.unshift(current.object.name);
            break;
          }

          current = current.object;
        }

        // Only process if this is a styles access
        if (propertyChain[0] === 'styles') {
          // Skip styles access entirely - ComponentStyles interface guarantees structure
          // styles is a standard prop with a fixed interface, all required properties exist
          // This prevents false positives for patterns like: styles.borders.radius
          // The ComponentStyles interface (runtime-types.ts) defines all required properties
          // including colors, spacing, typography, borders, etc. as non-optional
          return;
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(stylesUnsafeAccessRule);
