import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * The set of methods allowed on the ComponentCallbacks interface.
 * Any access to `callbacks.X` where X is not in this set is a violation.
 */
const ALLOWED_CALLBACK_METHODS = new Set(['OpenEntityRecord', 'RegisterMethod', 'CreateSimpleNotification']);

/** Valid notification style values for CreateSimpleNotification. */
const VALID_NOTIFICATION_STYLES = ['none', 'success', 'error', 'warning', 'info'];

/** Shared rule name used for all violations emitted by this consolidated rule. */
const RULE_NAME = 'callback-event-validation';

/**
 * Rule: callback-event-validation
 *
 * Consolidated rule that replaces four separate rules:
 * - callback-parameter-validation: validates callback method parameter counts and types
 * - callbacks-passthrough-only: ensures callbacks are passed through unchanged to children
 * - callbacks-usage-validation: validates callbacks are only accessed via allowed methods
 * - event-invocation-pattern: ensures event props are null-checked before invocation
 *
 * Severity: critical / high / medium / low (varies by check)
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'callback-event-validation')
export class CallbackEventValidationRule extends BaseLintRule {
  get Name() { return RULE_NAME; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];
    const componentEvents = buildComponentEventsSet(componentSpec);

    traverse(ast, {
      CallExpression: (path: NodePath<t.CallExpression>) => {
        checkCallbackParameterValidation(path, violations);
        checkObjectAssignOnCallbacks(path, violations);
        checkEventInvocationNullCheck(path, violations, componentEvents);
      },

      MemberExpression: (path: NodePath<t.MemberExpression>) => {
        checkCallbackMethodUsage(path, violations, componentEvents);
      },

      OptionalCallExpression: (path: NodePath<t.OptionalCallExpression>) => {
        // Optional chaining on events (e.g. onFoo?.(data)) is the correct pattern — no violation
        checkOptionalCallOnEvent(path, componentEvents);
      },

      JSXAttribute: (path: NodePath<t.JSXAttribute>) => {
        checkCallbacksPassthrough(path, violations);
      },

      VariableDeclarator: (path: NodePath<t.VariableDeclarator>) => {
        checkCallbacksDestructuring(path, violations, componentEvents);
        checkCallbacksSpreadInVariable(path, violations);
      },
    });

    return violations;
  }
}

// ---------------------------------------------------------------------------
// Helper: build component events set from spec
// ---------------------------------------------------------------------------

function buildComponentEventsSet(componentSpec?: ComponentSpec): Set<string> {
  const componentEvents = new Set<string>();
  if (componentSpec?.events) {
    for (const event of componentSpec.events) {
      if (event.name) {
        componentEvents.add(event.name);
      }
    }
  }
  return componentEvents;
}

// ---------------------------------------------------------------------------
// Callback parameter validation helpers
// ---------------------------------------------------------------------------

function isCallbacksMemberCall(callee: t.Expression | t.V8IntrinsicIdentifier): callee is t.MemberExpression | t.OptionalMemberExpression {
  if (!t.isOptionalMemberExpression(callee) && !t.isMemberExpression(callee)) {
    return false;
  }
  return (
    (t.isIdentifier(callee.object) && callee.object.name === 'callbacks') ||
    (t.isOptionalMemberExpression(callee) && t.isIdentifier(callee.object) && callee.object.name === 'callbacks')
  );
}

function checkCallbackParameterValidation(path: NodePath<t.CallExpression>, violations: Violation[]): void {
  const callee = path.node.callee;
  if (!isCallbacksMemberCall(callee)) {
    return;
  }
  if (!t.isIdentifier(callee.property)) {
    return;
  }

  const methodName = callee.property.name;
  const args = path.node.arguments;

  if (methodName === 'OpenEntityRecord') {
    validateOpenEntityRecord(path, args, violations);
  } else if (methodName === 'RegisterMethod') {
    validateRegisterMethod(path, args, violations);
  } else if (methodName === 'CreateSimpleNotification') {
    validateCreateSimpleNotification(path, args, violations);
  }
}

function validateOpenEntityRecord(
  path: NodePath<t.CallExpression>,
  args: (t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder)[],
  violations: Violation[]
): void {
  if (args.length < 2) {
    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `OpenEntityRecord requires 2 parameters (entityName, key), but ${args.length} provided`,
      suggestion: {
        text: `OpenEntityRecord expects an entity name and a key parameter.`,
        example: `callbacks?.OpenEntityRecord?.(entityName, recordKey);`,
      },
    });
  }
}

function validateRegisterMethod(
  path: NodePath<t.CallExpression>,
  args: (t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder)[],
  violations: Violation[]
): void {
  if (args.length < 2) {
    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `RegisterMethod requires 2 parameters (methodName, handler), but ${args.length} provided`,
      suggestion: {
        text: `RegisterMethod expects a method name and a handler function.`,
        example: `callbacks?.RegisterMethod?.('myMethod', myHandler);`,
      },
    });
  }
}

function validateCreateSimpleNotification(
  path: NodePath<t.CallExpression>,
  args: (t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder)[],
  violations: Violation[]
): void {
  if (args.length < 1) {
    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `CreateSimpleNotification requires at least 1 parameter (message), but ${args.length} provided`,
      suggestion: {
        text: `CreateSimpleNotification expects a message and optional style and hideAfter parameters.`,
        example: `callbacks?.CreateSimpleNotification?.('Success!', 'success', 3000);`,
      },
    });
  } else if (args.length >= 2) {
    validateNotificationStyle(args[1], violations);
  }

  if (args.length >= 3) {
    validateHideAfterParam(args[2], violations);
  }
}

function validateNotificationStyle(
  styleArg: t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder,
  violations: Violation[]
): void {
  if (t.isStringLiteral(styleArg) && !VALID_NOTIFICATION_STYLES.includes(styleArg.value)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'medium',
      line: styleArg.loc?.start.line || 0,
      column: styleArg.loc?.start.column || 0,
      message: `Invalid notification style "${styleArg.value}". Must be one of: ${VALID_NOTIFICATION_STYLES.join(', ')}`,
      suggestion: {
        text: `Use one of the valid notification styles.`,
        example: `callbacks?.CreateSimpleNotification?.('Message', 'success', 3000);`,
      },
    });
  }
}

function validateHideAfterParam(
  hideAfterArg: t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder,
  violations: Violation[]
): void {
  if (t.isNumericLiteral(hideAfterArg) && hideAfterArg.value < 0) {
    violations.push({
      rule: RULE_NAME,
      severity: 'low',
      line: hideAfterArg.loc?.start.line || 0,
      column: hideAfterArg.loc?.start.column || 0,
      message: `hideAfter parameter should be a positive number (milliseconds)`,
      suggestion: {
        text: `Use a positive number for auto-hide duration in milliseconds.`,
        example: `callbacks?.CreateSimpleNotification?.('Message', 'success', 3000); // Hide after 3 seconds`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Callbacks usage validation helpers (allowed methods only, not events)
// ---------------------------------------------------------------------------

function checkCallbackMethodUsage(
  path: NodePath<t.MemberExpression>,
  violations: Violation[],
  componentEvents: Set<string>
): void {
  if (!t.isIdentifier(path.node.object) || path.node.object.name !== 'callbacks') {
    return;
  }
  if (!t.isIdentifier(path.node.property)) {
    return;
  }

  const methodName = path.node.property.name;

  // Valid runtime callback — allow it
  if (ALLOWED_CALLBACK_METHODS.has(methodName)) {
    return;
  }

  if (componentEvents.has(methodName)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Event "${methodName}" should not be accessed from callbacks. Events are passed as direct props to the component. Use the prop directly: ${methodName}`,
      suggestion: {
        text: `Events defined in the component spec are passed as direct props, not through callbacks. Access the event directly as a prop.`,
        example: `// ❌ WRONG - Accessing event from callbacks
const { ${methodName} } = callbacks || {};
callbacks?.${methodName}?.(data);

// ✅ CORRECT - Event is a direct prop
// In the component props destructuring:
function MyComponent({ ..., ${methodName} }) {
  // Use with null checking:
  if (${methodName}) {
    ${methodName}(data);
  }
}`,
      },
    });
  } else {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Invalid callback method "${methodName}". The callbacks prop only supports: ${Array.from(ALLOWED_CALLBACK_METHODS).join(', ')}`,
      suggestion: {
        text: `The callbacks prop is reserved for specific MemberJunction framework methods. Custom events should be defined in the component spec's events array and passed as props.`,
        example: `// Allowed callbacks methods:
callbacks?.OpenEntityRecord?.(entityName, key);
callbacks?.RegisterMethod?.(methodName, handler);
callbacks?.CreateSimpleNotification?.(message, style, hideAfter);

// For custom events, define them in the spec and use as props:
function MyComponent({ onCustomEvent }) {
  if (onCustomEvent) {
    onCustomEvent(data);
  }
}`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Callbacks destructuring validation (from VariableDeclarator)
// ---------------------------------------------------------------------------

function checkCallbacksDestructuring(
  path: NodePath<t.VariableDeclarator>,
  violations: Violation[],
  componentEvents: Set<string>
): void {
  if (!t.isObjectPattern(path.node.id)) {
    return;
  }

  // Match: const { X } = callbacks
  const isDirectCallbacks = t.isIdentifier(path.node.init) && path.node.init.name === 'callbacks';

  // Match: const { X } = callbacks || {}
  const isCallbacksWithFallback =
    t.isLogicalExpression(path.node.init) &&
    path.node.init.operator === '||' &&
    t.isIdentifier(path.node.init.left) &&
    path.node.init.left.name === 'callbacks';

  if (!isDirectCallbacks && !isCallbacksWithFallback) {
    return;
  }

  for (const prop of path.node.id.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) {
      continue;
    }

    const methodName = prop.key.name;

    // Valid runtime callback — allow it
    if (ALLOWED_CALLBACK_METHODS.has(methodName)) {
      continue;
    }

    if (componentEvents.has(methodName)) {
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `Event "${methodName}" should not be destructured from callbacks. Events are passed as direct props to the component.`,
        suggestion: {
          text: `Events should be destructured from the component props, not from callbacks.`,
          example: `// ❌ WRONG
const { ${methodName} } = callbacks || {};

// ✅ CORRECT
function MyComponent({ utilities, styles, callbacks, ${methodName} }) {
  // ${methodName} is now available as a prop
}`,
        },
      });
    } else {
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: prop.loc?.start.line || 0,
        column: prop.loc?.start.column || 0,
        message: `Invalid callback method "${methodName}" being destructured. The callbacks prop only supports: ${Array.from(ALLOWED_CALLBACK_METHODS).join(', ')}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Callbacks passthrough validation helpers
// ---------------------------------------------------------------------------

function checkCallbacksPassthrough(path: NodePath<t.JSXAttribute>, violations: Violation[]): void {
  if (!t.isJSXIdentifier(path.node.name) || path.node.name.name !== 'callbacks') {
    return;
  }

  const value = path.node.value;
  if (!t.isJSXExpressionContainer(value)) {
    return;
  }

  const expr = value.expression;

  // Valid patterns: callbacks={callbacks} or callbacks={props.callbacks}
  const isValidPassthrough =
    (t.isIdentifier(expr) && expr.name === 'callbacks') ||
    (t.isMemberExpression(expr) && t.isIdentifier(expr.property) && expr.property.name === 'callbacks');

  if (isValidPassthrough) {
    return;
  }

  if (t.isObjectExpression(expr)) {
    checkObjectExpressionPassthrough(path, expr, violations);
  } else if (t.isConditionalExpression(expr) || t.isLogicalExpression(expr)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'medium',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Callbacks should be passed through directly without conditional logic. Consider handling the condition at a higher level.`,
      suggestion: {
        text: `Pass callbacks directly or handle conditions in parent component.`,
        example: `// ⚠️ AVOID - Conditional callbacks
<ChildComponent
  callbacks={someCondition ? callbacks : undefined}
/>

// ✅ BETTER - Pass callbacks directly
<ChildComponent
  callbacks={callbacks}
/>`,
      },
    });
  } else if (!t.isIdentifier(expr) && !t.isMemberExpression(expr)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Callbacks must be passed through unchanged. Found complex expression instead of direct passthrough.`,
      suggestion: {
        text: `Pass the callbacks prop directly without modification.`,
        example: `// ✅ CORRECT
<ChildComponent callbacks={callbacks} />`,
      },
    });
  }
}

function checkObjectExpressionPassthrough(
  path: NodePath<t.JSXAttribute>,
  expr: t.ObjectExpression,
  violations: Violation[]
): void {
  const hasSpread = expr.properties.some(
    (prop) => t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'callbacks'
  );

  if (hasSpread) {
    const addedProps = expr.properties
      .filter((prop) => !t.isSpreadElement(prop) && t.isObjectProperty(prop))
      .map((prop) => {
        if (t.isObjectProperty(prop)) {
          if (t.isIdentifier(prop.key)) {
            return prop.key.name;
          } else if (t.isStringLiteral(prop.key)) {
            return prop.key.value;
          }
        }
        return 'unknown';
      });

    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Callbacks must be passed through unchanged. Found spreading with additional properties: ${addedProps.join(', ')}. Component events should be passed as direct props, not added to callbacks.`,
      suggestion: {
        text: `The callbacks prop should only contain OpenEntityRecord and RegisterMethod. Pass component events as separate props.`,
        example: `// ❌ WRONG - Modifying callbacks
<ChildComponent
  callbacks={{ ...callbacks, onOpen: handleOpen }}
/>

// ✅ CORRECT - Pass callbacks unchanged, events as props
<ChildComponent
  callbacks={callbacks}
  onOpen={handleOpen}
/>`,
      },
    });
  } else if (expr.properties.length > 0) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Callbacks must be passed through unchanged. Do not create new callback objects. Pass the callbacks prop directly.`,
      suggestion: {
        text: `Pass callbacks directly without modification.`,
        example: `// ❌ WRONG - Creating new callbacks object
<ChildComponent
  callbacks={{ OpenEntityRecord: customHandler }}
/>

// ✅ CORRECT - Pass callbacks unchanged
<ChildComponent
  callbacks={callbacks}
/>`,
      },
    });
  }
}

/** Check for Object.assign(callbacks, ...) */
function checkObjectAssignOnCallbacks(path: NodePath<t.CallExpression>, violations: Violation[]): void {
  if (
    t.isMemberExpression(path.node.callee) &&
    t.isIdentifier(path.node.callee.object) &&
    path.node.callee.object.name === 'Object' &&
    t.isIdentifier(path.node.callee.property) &&
    path.node.callee.property.name === 'assign'
  ) {
    const args = path.node.arguments;
    const hasCallbacks = args.some((arg) => t.isIdentifier(arg) && arg.name === 'callbacks');

    if (hasCallbacks) {
      violations.push({
        rule: RULE_NAME,
        severity: 'critical',
        line: path.node.loc?.start.line || 0,
        column: path.node.loc?.start.column || 0,
        message: `Do not modify callbacks with Object.assign. Callbacks should be passed through unchanged.`,
        suggestion: {
          text: `Pass callbacks directly and use separate props for component events.`,
          example: `// ❌ WRONG
const modifiedCallbacks = Object.assign({}, callbacks, { onOpen: handler });

// ✅ CORRECT - Keep callbacks separate from events
<Component callbacks={callbacks} onOpen={handler} />`,
        },
      });
    }
  }
}

/** Check for variable assignments that spread callbacks with additional props. */
function checkCallbacksSpreadInVariable(path: NodePath<t.VariableDeclarator>, violations: Violation[]): void {
  if (!t.isObjectExpression(path.node.init)) {
    return;
  }

  const hasCallbacksSpread = path.node.init.properties.some(
    (prop) => t.isSpreadElement(prop) && t.isIdentifier(prop.argument) && prop.argument.name === 'callbacks'
  );
  if (!hasCallbacksSpread) {
    return;
  }

  const hasAdditionalProps = path.node.init.properties.some((prop) => !t.isSpreadElement(prop));
  if (hasAdditionalProps) {
    violations.push({
      rule: RULE_NAME,
      severity: 'critical',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Do not create modified copies of callbacks. Pass callbacks unchanged and use separate props for events.`,
      suggestion: {
        text: `Keep callbacks immutable and pass component events as separate props.`,
        example: `// ❌ WRONG
const extendedCallbacks = { ...callbacks, onCustomEvent: handler };

// ✅ CORRECT - Keep them separate
// Pass to child component:
<Component callbacks={callbacks} onCustomEvent={handler} />`,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Event invocation null-check validation helpers
// ---------------------------------------------------------------------------

function checkEventInvocationNullCheck(
  path: NodePath<t.CallExpression>,
  violations: Violation[],
  componentEvents: Set<string>
): void {
  if (componentEvents.size === 0) {
    return;
  }
  if (!t.isIdentifier(path.node.callee)) {
    return;
  }

  const eventName = path.node.callee.name;
  if (!componentEvents.has(eventName)) {
    return;
  }

  if (!hasNullCheckAncestor(path, eventName)) {
    violations.push({
      rule: RULE_NAME,
      severity: 'medium',
      line: path.node.loc?.start.line || 0,
      column: path.node.loc?.start.column || 0,
      message: `Event "${eventName}" is being invoked without null-checking. Events are optional props and should be checked before invocation.`,
      suggestion: {
        text: `Always check that an event prop exists before invoking it, as events are optional.`,
        example: `// ❌ WRONG - No null check
${eventName}(data);

// ✅ CORRECT - With null check
if (${eventName}) {
  ${eventName}(data);
}

// ✅ ALSO CORRECT - Inline check
${eventName} && ${eventName}(data);

// ✅ ALSO CORRECT - Optional chaining
${eventName}?.(data);`,
      },
    });
  }
}

function hasNullCheckAncestor(path: NodePath<t.CallExpression>, eventName: string): boolean {
  let currentPath: NodePath<t.Node> | null = path.parentPath;

  while (currentPath) {
    if (t.isIfStatement(currentPath.node)) {
      if (isEventNameTest(currentPath.node.test, eventName)) {
        return true;
      }
    } else if (t.isLogicalExpression(currentPath.node) && currentPath.node.operator === '&&') {
      if (t.isIdentifier(currentPath.node.left) && currentPath.node.left.name === eventName) {
        return true;
      }
    } else if (t.isConditionalExpression(currentPath.node)) {
      if (t.isIdentifier(currentPath.node.test) && currentPath.node.test.name === eventName) {
        return true;
      }
    }
    currentPath = currentPath.parentPath || null;
  }

  return false;
}

function isEventNameTest(test: t.Expression, eventName: string): boolean {
  if (t.isIdentifier(test) && test.name === eventName) {
    return true;
  }
  if (t.isLogicalExpression(test) && test.operator === '&&') {
    if (t.isIdentifier(test.left) && test.left.name === eventName) {
      return true;
    }
  }
  return false;
}

/** Optional chaining on events is the correct pattern — no-op. */
function checkOptionalCallOnEvent(_path: NodePath<t.OptionalCallExpression>, _componentEvents: Set<string>): void {
  // This is the correct pattern, no violation needed.
  return;
}
