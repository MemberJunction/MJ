import { BaseLintRule } from '../lint-rule';
import { RegisterClass } from '@memberjunction/global';
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
@RegisterClass(BaseLintRule, 'validate-component-props')
export class ValidateComponentPropsRule extends BaseLintRule {
  get Name() { return 'validate-component-props'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, componentName: string, componentSpec?: ComponentSpec): Violation[] {
    // Skip - this rule is deprecated and replaced by ComponentPropRule
    return [];
    }
}
