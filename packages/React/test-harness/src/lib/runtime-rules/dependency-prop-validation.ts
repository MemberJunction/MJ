import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';

/**
 * Rule: dependency-prop-validation
 *
 * DEPRECATED: This rule is being replaced by ComponentPropRule in Phase 3.
 * Will be removed after Phase 3 validation is complete.
 * Merged into ComponentPropRule which handles:
 * - Prop existence, required props, type checking, unknown props
 *
 * The full implementation is preserved in the monolith as a comment block.
 * This extracted version just returns empty violations.
 *
 * Severity: N/A (deprecated)
 * Applies to: all components
 *
 * Closure dependencies (in commented-out code): TypeInferenceEngine, ComponentMetadataEngine
 */
export const dependencyPropValidationRule: LintRule = {
  name: 'dependency-prop-validation',
  appliesTo: 'all',
  deprecated: true, // Phase 3: Merged into ComponentPropRule
  test: () => {
    // Skip - this rule is deprecated and replaced by ComponentPropRule
    return [];
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(dependencyPropValidationRule);
