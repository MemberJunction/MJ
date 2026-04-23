import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';

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
@RegisterClass(BaseLintRule, 'dependency-prop-validation')
export class DependencyPropValidationRule extends BaseLintRule {
  get Name() { return 'dependency-prop-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(_ast: t.File): Violation[] {
    // Skip - this rule is deprecated and replaced by ComponentPropRule
    return [];
  }
}
