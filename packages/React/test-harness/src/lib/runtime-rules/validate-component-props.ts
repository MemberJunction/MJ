import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import * as t from '@babel/types';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: validate-component-props
 *
 * DEPRECATED: This rule is being replaced by ComponentPropRule in Phase 3.
 * Will be removed after Phase 3 validation is complete.
 * Merged into ComponentPropRule which handles semantic constraint validation.
 *
 * Previously validated component props against dependency specs using
 * ComponentMetadataEngine, PropValueExtractor, SemanticValidator, and MJGlobal.
 * Those closure dependencies are no longer needed since the rule is deprecated.
 *
 * Severity: varies
 * Applies to: all components
 */
export const validateComponentPropsRule: LintRule = {
  name: 'validate-component-props',
  appliesTo: 'all',
  deprecated: true, // Phase 3: Merged into ComponentPropRule
  test: (ast: t.File, componentName: string, componentSpec?: ComponentSpec) => {
    // Skip - this rule is deprecated and replaced by ComponentPropRule
    return [];
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(validateComponentPropsRule);
