/**
 * Required-When Constraint Validator
 *
 * Validates that a property is present when a specified condition is met.
 * Used for conditional requirements like "valueField is required when aggregateMethod is 'sum'".
 *
 * Config:
 * - condition: JavaScript expression evaluated with siblingProp as the dependent property value
 *   Example: "siblingProp === 'sum' || siblingProp === 'average'"
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
import { RegisterClass } from '@memberjunction/global';
import { BaseConstraintValidator } from './base-constraint-validator';
import { ValidationContext } from './validation-context';

@RegisterClass(BaseConstraintValidator, 'required-when')
export class RequiredWhenValidator extends BaseConstraintValidator {
  /**
   * Get description of this validator
   */
  getDescription(): string {
    return 'Validates that a property is present when a specified condition is met based on another property value';
  }

  /**
   * Validate that a property is present when a condition is met
   *
   * Evaluates a JavaScript condition expression with the dependent property value,
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

    // Evaluate the condition
    let conditionMet = false;
    try {
      // Create a safe evaluation context
      const siblingProp = dependentPropValue;
      // eslint-disable-next-line no-eval
      conditionMet = eval(condition);
    } catch (error) {
      console.error(`Error evaluating required-when condition "${condition}":`, error);
      return violations;
    }

    // If condition is met, check if the property has a value
    if (conditionMet) {
      const hasValue = context.propertyValue !== undefined &&
                      context.propertyValue !== null &&
                      context.propertyValue !== '';

      if (!hasValue) {
        const message = constraint.errorTemplate
          ? constraint.errorTemplate.replace(`{${constraint.dependsOn}}`, String(dependentPropValue))
          : `${context.propertyName} is required when ${constraint.dependsOn} is ${dependentPropValue}`;

        violations.push(
          this.createViolation('missing-required-prop', message, 'high')
        );
      }
    }

    return violations;
  }
}
