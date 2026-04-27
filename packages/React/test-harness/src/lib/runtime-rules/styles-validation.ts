import { traverse, NodePath } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { StylesTypeAnalyzer } from '../styles-type-analyzer';

/**
 * Rule: styles-validation
 *
 * Consolidated rule that combines:
 * 1. styles-invalid-path — Validates that styles property access paths are valid
 *    according to the StylesTypeAnalyzer. Provides suggestions for misspelled
 *    or misplaced properties.
 * 2. styles-unsafe-access — Validates safe access patterns on styles objects.
 *    Currently skips styles access because ComponentStyles interface guarantees
 *    structure (all required properties exist), but included for future activation.
 *
 * Severity: critical (invalid path), varies (unsafe access)
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

// Standard props that are always defined with guaranteed structure
// The ComponentStyles interface guarantees all required properties exist
// So we don't need to check for optional chaining on the styles object itself
const standardProps = new Set(['utilities', 'styles', 'components', 'callbacks', 'savedUserSettings', 'onSaveUserSettings']);

@RegisterClass(BaseLintRule, 'styles-validation')
export class StylesValidationRule extends BaseLintRule {
  get Name() { return 'styles-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];
    const analyzer = getStylesAnalyzer();

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
        if (propertyChain[0] !== 'styles') {
          return;
        }

        // --- styles-invalid-path logic ---
        checkInvalidPath(path, propertyChain, analyzer, violations);

        // --- styles-unsafe-access logic ---
        // Skip styles access entirely - ComponentStyles interface guarantees structure.
        // styles is a standard prop with a fixed interface, all required properties exist.
        // This prevents false positives for patterns like: styles.borders.radius
        // The ComponentStyles interface (runtime-types.ts) defines all required properties
        // including colors, spacing, typography, borders, etc. as non-optional.
        //
        // When this rule becomes active in the future, hasOptionalChaining and
        // standardProps are available to implement unsafe-access checks here.
      },
    });

    return violations;
  }
}

/**
 * Checks whether a styles property access path is valid according to the
 * StylesTypeAnalyzer. Produces a violation with suggestions when invalid.
 */
function checkInvalidPath(
  path: NodePath<t.MemberExpression>,
  propertyChain: string[],
  analyzer: StylesTypeAnalyzer,
  violations: Violation[]
): void {
  if (analyzer.isValidPath(propertyChain)) {
    return;
  }

  const suggestions = analyzer.getSuggestionsForPath(propertyChain);
  const accessPath = propertyChain.join('.');

  let message = buildInvalidPathMessage(accessPath, propertyChain, suggestions);

  // Get a contextual default value
  const defaultValue = analyzer.getDefaultValueForPath(propertyChain);
  message += `\n\nSuggested fix with safe access:\n  ${accessPath.replace(/\./g, '?.')} || ${defaultValue}`;

  violations.push({
    rule: 'styles-validation',
    severity: 'critical',
    line: path.node.loc?.start.line || 0,
    column: path.node.loc?.start.column || 0,
    message,
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

/**
 * Builds a human-readable message for an invalid styles path, including
 * did-you-mean suggestions, correct paths, and available properties.
 */
function buildInvalidPathMessage(
  accessPath: string,
  propertyChain: string[],
  suggestions: { didYouMean: string | null; correctPaths: string[]; availableAtParent: string[] }
): string {
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

  return message;
}
