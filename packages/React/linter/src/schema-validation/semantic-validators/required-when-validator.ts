/**
 * Required-When Constraint Validator
 *
 * Validates that a property is present when a specified condition is met.
 * Used for conditional requirements like "valueField is required when aggregateMethod is 'sum'".
 *
 * Config:
 * - condition: boolean expression over `siblingProp` (the dependent property value).
 *   It is evaluated by SafeExpressionEvaluator with `siblingProp` as the only name in scope.
 *   Example: "siblingProp === 'sum' || siblingProp === 'average'"
 *   A condition the evaluator cannot accept is treated as not met and reported as
 *   an 'unsupported-condition' violation.
 *
 * Example usage in spec JSON:
 * ```json
 * {
 *   "type": "required-when",
 *   "dependsOn": "aggregateMethod",
 *   "config": {
 *     "condition": "siblingProp === 'sum' || siblingProp === 'average' || siblingProp === 'min' || siblingProp === 'max'"
 *   },
 *   "errorTemplate": "valueField is required when aggregateMethod is '{aggregateMethod}'"
 * }
 * ```
 */

import { PropertyConstraint, ConstraintViolation } from '@memberjunction/interactive-component-types';
import { RegisterClass, DefaultExpressionEvaluator } from '@memberjunction/global';
import { SemanticValidator } from './semantic-validator';
import { ValidationContext } from './validation-context';

@RegisterClass(SemanticValidator, 'required-when')
export class RequiredWhenValidator extends SemanticValidator {
  /**
   * Get description of this validator
   */
  getDescription(): string {
    return 'Validates that a property is present when a specified condition is met based on another property value';
  }

  /**
   * Validate that a property is present when a condition is met
   *
   * Evaluates the condition safely with the dependent property value as `siblingProp`,
   * and checks if the current property has a value when the condition is true.
   *
   * @param context - Validation context containing property info and sibling props
   * @param constraint - The constraint definition from the spec
   * @returns Array of violations (empty if valid)
   */
  validate(context: ValidationContext, constraint: PropertyConstraint): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    if (!constraint.dependsOn) {
      return violations; // Can't validate without a dependency
    }

    const dependentPropValue = context.siblingProps.get(constraint.dependsOn);

    // If dependent prop doesn't exist, condition doesn't apply
    if (dependentPropValue === undefined || dependentPropValue === null) {
      return violations;
    }

    const condition = constraint.config?.condition;
    if (!condition || typeof condition !== 'string') {
      console.warn(`required-when validator missing condition config for ${context.propertyName}`);
      return violations;
    }

    const evaluation = DefaultExpressionEvaluator.Evaluate(condition, { siblingProp: dependentPropValue });
    if (!evaluation.success) {
      return [this.unsupportedConditionViolation(context, constraint, evaluation.error)];
    }
    const conditionMet = evaluation.value === true;

    // If condition is met, check if the property has a value
    if (conditionMet) {
      const hasValue = context.propertyValue !== undefined &&
                      context.propertyValue !== null &&
                      context.propertyValue !== '';

      if (!hasValue) {
        const message = constraint.errorTemplate
          // Function replacement — the dependent value is user data that may contain
          // `$`. See issue #3171.
          ? constraint.errorTemplate.replace(
              `{${constraint.dependsOn}}`,
              () => String(dependentPropValue),
            )
          : `${context.propertyName} is required when ${constraint.dependsOn} is ${dependentPropValue}`;

        violations.push(
          this.createViolation('missing-required-prop', message, 'high')
        );
      }
    }

    return violations;
  }

  /**
   * Builds the violation for a condition that the safe evaluator does not accept.
   */
  private unsupportedConditionViolation(
    context: ValidationContext,
    constraint: PropertyConstraint,
    reason: string | undefined
  ): ConstraintViolation {
    return this.createViolation(
      'unsupported-condition',
      `required-when condition for ${context.propertyName} (depends on ${constraint.dependsOn}) is not supported and was not evaluated`,
      'medium',
      `Use a simple boolean expression over siblingProp, for example "siblingProp === 'sum' || siblingProp === 'max'".${reason ? ` Reason: ${reason}` : ''}`
    );
  }
}
