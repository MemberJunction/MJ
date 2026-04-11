import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { TypeInferenceEngine } from '../type-inference-engine';

/**
 * Rule: type-inference-errors
 *
 * Surfaces errors found by TypeInferenceEngine (e.g., date parameter validation).
 *
 * DEPRECATED: This rule is being replaced by TypeCompatibilityRule in Phase 1 refactor.
 * Will be removed after Phase 1 validation is complete.
 *
 * Severity: high/medium (depends on error type)
 * Applies to: all components
 *
 * Closure dependencies: TypeInferenceEngine (instantiated locally, no closure)
 */
export const typeInferenceErrorsRule: LintRule = {
  name: 'type-inference-errors',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    // Create type inference engine
    const typeEngine = new TypeInferenceEngine(componentSpec);

    // Run analysis synchronously (validateQueryParameters is called during traversal)
    // The async part of analyze() is not needed for date validation
    typeEngine.analyze(ast);

    // Get errors collected during analysis
    const errors = typeEngine.getErrors();

    // Convert type inference errors to violations
    for (const error of errors) {
      violations.push({
        rule: 'type-inference-errors',
        severity: error.type === 'error' ? 'high' : 'medium',
        line: error.line,
        column: error.column,
        message: error.message,
        code: error.code || '',
      });
    }

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(typeInferenceErrorsRule);
