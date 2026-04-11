import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { StylesTypeAnalyzer } from '../styles-type-analyzer';

/**
 * Rule: styles-invalid-path
 *
 * Validates that styles property access paths are valid according to the
 * StylesTypeAnalyzer. Provides suggestions for misspelled or misplaced properties.
 *
 * NOTE: This rule depends on StylesTypeAnalyzer which was previously accessed via
 * ComponentLinter.getStylesAnalyzer(). It now creates its own instance.
 *
 * Severity: critical
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

export const stylesInvalidPathRule: LintRule = {
  name: 'styles-invalid-path',
  appliesTo: 'all',
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    const violations: Violation[] = [];
    const analyzer = getStylesAnalyzer();

    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        // Build the complete property chain first
        const propertyChain: string[] = [];
        let current: t.Expression = path.node;

        // Walk up from the deepest member expression to build the full chain
        while (t.isMemberExpression(current)) {
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
          // Validate the path
          if (!analyzer.isValidPath(propertyChain)) {
            const suggestions = analyzer.getSuggestionsForPath(propertyChain);
            const accessPath = propertyChain.join('.');

            let message = `Invalid styles property path: "${accessPath}"`;

            if (suggestions.didYouMean) {
              message += `\n\nDid you mean: ${suggestions.didYouMean}?`;
            }

            if (suggestions.correctPaths.length > 0) {
              message += `\n\nThe property "${propertyChain[propertyChain.length - 1]}" exists at:`;
              suggestions.correctPaths.forEach((p: string) => {
                message += `\n  - ${p}`;
              });
            }

            if (suggestions.availableAtParent.length > 0) {
              const parentPath = propertyChain.slice(0, -1).join('.');
              message += `\n\nAvailable properties at ${parentPath}:`;
              message += `\n  ${suggestions.availableAtParent.slice(0, 5).join(', ')}`;
              if (suggestions.availableAtParent.length > 5) {
                message += ` (and ${suggestions.availableAtParent.length - 5} more)`;
              }
            }

            // Get a contextual default value
            const defaultValue = analyzer.getDefaultValueForPath(propertyChain);
            message += `\n\nSuggested fix with safe access:\n  ${accessPath.replace(/\./g, '?.')} || ${defaultValue}`;

            violations.push({
              rule: 'styles-invalid-path',
              severity: 'critical',
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
              message: message,
              code: accessPath,
              suggestion: {
                text: 'Fix invalid styles property paths. Use the correct ComponentStyles interface structure.',
                example: `// ❌ WRONG - Invalid property paths:
styles.fontSize.small           // fontSize is not at root level
styles.colors.background        // colors.background exists
styles.spacing.small            // should be styles.spacing.sm

// ✅ CORRECT - Valid property paths:
styles.typography.fontSize.sm   // fontSize is under typography
styles.colors.background        // correct path
styles.spacing.sm               // correct size name

// With safe access and fallbacks:
styles?.typography?.fontSize?.sm || '14px'
styles?.colors?.background || '#FFFFFF'
styles?.spacing?.sm || '8px'`,
              },
            });
          }
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(stylesInvalidPathRule);
