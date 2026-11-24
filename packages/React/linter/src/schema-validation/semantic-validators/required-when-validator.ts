/**
 * Required-When Constraint Validator
 *
 * Validates that a property is present when a specified condition is met.
 * Used for conditional requirements like "valueField is required when aggregateMethod is 'sum'".
 *
 * Config:
 * - condition: boolean expression over `siblingProp` (the dependent property value).
 *   Accepted forms: `siblingProp`, string/number (including negative)/boolean/null literals, `undefined`, arrays of
 *   literals, the operators === !== == != < <= > >= && || ! typeof, parentheses, and
 *   `[<literals>].includes(siblingProp)`. At most MAX_CONDITION_LENGTH characters.
 *   An accepted condition is evaluated by SafeExpressionEvaluator with `siblingProp` as the only name in scope.
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

import { parseExpression } from '@babel/parser';
import * as t from '@babel/types';
import { PropertyConstraint, ConstraintViolation } from '@memberjunction/interactive-component-types';
import { RegisterClass, DefaultExpressionEvaluator } from '@memberjunction/global';
import { SemanticValidator } from './semantic-validator';
import { ValidationContext } from './validation-context';

/** Longest condition text that is accepted. */
export const MAX_CONDITION_LENGTH = 300;

const COMPARISON_OPERATORS: ReadonlySet<string> = new Set(['===', '!==', '==', '!=', '<', '<=', '>', '>=']);
const LOGICAL_OPERATORS: ReadonlySet<string> = new Set(['&&', '||']);
const UNARY_OPERATORS: ReadonlySet<string> = new Set(['!', 'typeof']);

function isNegativeNumber(node: t.Node): boolean {
  return t.isUnaryExpression(node, { operator: '-' }) && t.isNumericLiteral(node.argument);
}

function isLiteralNode(node: t.Node | null): boolean {
  return node !== null &&
    (t.isStringLiteral(node) || t.isNumericLiteral(node) || isNegativeNumber(node) || t.isBooleanLiteral(node) || t.isNullLiteral(node));
}

function isLiteralArray(node: t.Node): boolean {
  return t.isArrayExpression(node) && node.elements.every(isLiteralNode);
}

function isAllowedIdentifier(node: t.Node): boolean {
  return t.isIdentifier(node) && (node.name === 'siblingProp' || node.name === 'undefined');
}

/** True for `[<literals>].includes(siblingProp)`. */
function isIncludesCall(node: t.CallExpression): boolean {
  const callee = node.callee;
  return t.isMemberExpression(callee) &&
    !callee.computed &&
    t.isIdentifier(callee.property, { name: 'includes' }) &&
    isLiteralArray(callee.object) &&
    node.arguments.length === 1 &&
    t.isIdentifier(node.arguments[0], { name: 'siblingProp' });
}

/** True when every node of the expression is in the condition grammar. */
function isAllowedConditionNode(node: t.Node): boolean {
  if (isLiteralNode(node) || isAllowedIdentifier(node) || isLiteralArray(node)) {
    return true;
  }
  if (t.isBinaryExpression(node)) {
    return COMPARISON_OPERATORS.has(node.operator) && isAllowedConditionNode(node.left) && isAllowedConditionNode(node.right);
  }
  if (t.isLogicalExpression(node)) {
    return LOGICAL_OPERATORS.has(node.operator) && isAllowedConditionNode(node.left) && isAllowedConditionNode(node.right);
  }
  if (t.isUnaryExpression(node)) {
    return UNARY_OPERATORS.has(node.operator) && isAllowedConditionNode(node.argument);
  }
  if (t.isCallExpression(node)) {
    return isIncludesCall(node);
  }
  return false;
}

/**
 * Checks a required-when condition against the condition grammar without running it.
 * @returns the reason it is refused, or null when it is accepted
 */
export function CheckRequiredWhenCondition(condition: string): string | null {
  if (condition.length > MAX_CONDITION_LENGTH) {
    return `Condition is longer than ${MAX_CONDITION_LENGTH} characters`;
  }
  let expression: t.Expression;
  try {
    expression = parseExpression(condition);
  } catch {
    return 'Condition is not a valid expression';
  }
  return isAllowedConditionNode(expression) ? null : 'Condition uses a construct that is not supported';
}

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

    const refusal = CheckRequiredWhenCondition(condition);
    if (refusal) {
      return [this.unsupportedConditionViolation(context, constraint, refusal)];
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
      `Use comparisons of siblingProp with literals, for example "siblingProp === 'sum' || ['min', 'max'].includes(siblingProp)".${reason ? ` Reason: ${reason}` : ''}`
    );
  }
}
