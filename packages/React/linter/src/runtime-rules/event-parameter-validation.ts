import { traverse, NodePath, findClosestMatch } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec, ComponentEvent } from '@memberjunction/interactive-component-types';

const RULE_NAME = 'event-parameter-validation';

/**
 * Rule: event-parameter-validation
 *
 * Validates that event callback handlers access the correct properties from the
 * event object, as defined by the component spec's event parameter types.
 *
 * Catches LLM mistakes like using `e.data` (AG Grid convention) instead of
 * `e.record` (MJ DataGrid convention).
 *
 * Severity: high
 * Applies to: all components
 */
@RegisterClass(BaseLintRule, 'event-parameter-validation')
export class EventParameterValidationRule extends BaseLintRule {
  get Name() { return RULE_NAME; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    const eventTypeMap = buildEventTypeMap(componentSpec);
    if (eventTypeMap.size === 0) return violations;

    traverse(ast, {
      JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => {
        checkJSXEventHandlers(path, eventTypeMap, violations);
      },
      CallExpression: (path: NodePath<t.CallExpression>) => {
        checkCreateElementEventHandlers(path, eventTypeMap, violations);
      },
    });

    return violations;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Maps componentName → { eventName → Set<validPropertyNames> } */
type EventTypeMap = Map<string, Map<string, Set<string>>>;

// ---------------------------------------------------------------------------
// Build event type map from componentSpec.dependencies
// ---------------------------------------------------------------------------

function buildEventTypeMap(componentSpec: ComponentSpec | undefined): EventTypeMap {
  const result: EventTypeMap = new Map();
  if (!componentSpec?.dependencies) return result;

  for (const dep of componentSpec.dependencies) {
    if (!dep.name || !dep.events || dep.events.length === 0) continue;

    const eventMap = new Map<string, Set<string>>();
    for (const event of dep.events) {
      const validProps = extractEventPropertyNames(event);
      if (validProps.size > 0) {
        eventMap.set(event.name, validProps);
      }
    }

    if (eventMap.size > 0) {
      result.set(dep.name, eventMap);
    }
  }

  return result;
}

/**
 * Extract top-level property names from an event's parameter type string.
 *
 * The first (and typically only) parameter has a type string like:
 *   "{ record: object, cancel: boolean }"
 *   "{ sortState: { column: string, direction: string } }"
 *
 * We extract property names at brace depth 0 (inside the outermost braces).
 */
function extractEventPropertyNames(event: ComponentEvent): Set<string> {
  const result = new Set<string>();
  if (!event.parameters || event.parameters.length === 0) return result;

  const param = event.parameters[0];
  if (!param.type) return result;

  const typeStr = String(param.type);
  const props = parseTopLevelProperties(typeStr);
  for (const prop of props) {
    result.add(prop);
  }

  return result;
}

/**
 * Parse top-level property names from a type string like "{ a: T, b: U }".
 * Handles nested braces, semicolons, and commas as separators.
 */
function parseTopLevelProperties(typeStr: string): string[] {
  const result: string[] = [];

  // Find the outermost braces
  const firstBrace = typeStr.indexOf('{');
  const lastBrace = typeStr.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return result;

  const inner = typeStr.substring(firstBrace + 1, lastBrace);

  // Walk the string, tracking brace depth to find top-level "word:" patterns
  let depth = 0;
  let segmentStart = 0;

  for (let i = 0; i <= inner.length; i++) {
    const ch = inner[i];

    if (ch === '{' || ch === '<' || ch === '(') {
      depth++;
    } else if (ch === '}' || ch === '>' || ch === ')') {
      depth--;
    } else if (depth === 0 && (ch === ',' || ch === ';' || i === inner.length)) {
      const segment = inner.substring(segmentStart, i).trim();
      const propName = extractPropertyNameFromSegment(segment);
      if (propName) {
        result.push(propName);
      }
      segmentStart = i + 1;
    }
  }

  return result;
}

/**
 * Extract the property name from a segment like "record: object" or "sortState: { ... }".
 */
function extractPropertyNameFromSegment(segment: string): string | null {
  const match = segment.match(/^(\w+)\s*:/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// JSX traversal
// ---------------------------------------------------------------------------

/**
 * Convert an event prop name (onRowClick) to the event name (rowClick).
 */
function propNameToEventName(propName: string): string | null {
  if (!propName.startsWith('on') || propName.length < 3) return null;
  return propName.charAt(2).toLowerCase() + propName.slice(3);
}

/**
 * Check JSX element event handler props against the event type map.
 */
function checkJSXEventHandlers(
  path: NodePath<t.JSXOpeningElement>,
  eventTypeMap: EventTypeMap,
  violations: Violation[]
): void {
  const elementName = getJSXElementName(path.node.name);
  if (!elementName) return;

  const componentEventMap = eventTypeMap.get(elementName);
  if (!componentEventMap) return;

  for (const attr of path.node.attributes) {
    if (!t.isJSXAttribute(attr) || !t.isJSXIdentifier(attr.name)) continue;

    const propName = attr.name.name;
    const eventName = propNameToEventName(propName);
    if (!eventName) continue;

    const validProperties = componentEventMap.get(eventName);
    if (!validProperties) continue;

    analyzeEventHandlerAttribute(attr, eventName, elementName, validProperties, path, violations);
  }
}

function getJSXElementName(name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName): string | null {
  if (t.isJSXIdentifier(name)) return name.name;
  return null;
}

// ---------------------------------------------------------------------------
// React.createElement traversal
// ---------------------------------------------------------------------------

/**
 * Check React.createElement(ComponentName, { onEvent: handler }) calls
 * against the event type map.
 */
function checkCreateElementEventHandlers(
  path: NodePath<t.CallExpression>,
  eventTypeMap: EventTypeMap,
  violations: Violation[]
): void {
  if (!isReactCreateElement(path.node.callee)) return;

  const args = path.node.arguments;
  if (args.length < 2) return;

  // First arg is the component name (Identifier)
  const componentArg = args[0];
  if (!t.isIdentifier(componentArg)) return;

  const componentEventMap = eventTypeMap.get(componentArg.name);
  if (!componentEventMap) return;

  // Second arg is the props object
  const propsArg = args[1];
  if (!t.isObjectExpression(propsArg)) return;

  for (const prop of propsArg.properties) {
    if (!t.isObjectProperty(prop)) continue;
    if (!t.isIdentifier(prop.key) && !t.isStringLiteral(prop.key)) continue;

    const propName = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
    const eventName = propNameToEventName(propName);
    if (!eventName) continue;

    const validProperties = componentEventMap.get(eventName);
    if (!validProperties) continue;

    analyzeCreateElementHandler(prop.value, eventName, componentArg.name, validProperties, path, violations);
  }
}

/**
 * Check if a callee is React.createElement.
 */
function isReactCreateElement(callee: t.Expression | t.V8IntrinsicIdentifier): boolean {
  return (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.object) &&
    callee.object.name === 'React' &&
    t.isIdentifier(callee.property) &&
    callee.property.name === 'createElement'
  );
}

/**
 * Analyze a prop value from React.createElement props object.
 */
function analyzeCreateElementHandler(
  value: t.Expression | t.PatternLike,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  callPath: NodePath<t.CallExpression>,
  violations: Violation[]
): void {
  if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
    analyzeCallbackFunction(value, eventName, componentName, validProperties, violations);
  } else if (t.isIdentifier(value)) {
    analyzeNamedHandlerFromScope(value, eventName, componentName, validProperties, callPath, violations);
  }
  // MemberExpression (e.g., props.handleClick) — skip
}

/**
 * Resolve a named handler reference from a CallExpression scope.
 */
function analyzeNamedHandlerFromScope(
  identifier: t.Identifier,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  callPath: NodePath<t.CallExpression>,
  violations: Violation[]
): void {
  const binding = callPath.scope.getBinding(identifier.name);
  if (!binding) return;

  const bindingPath = binding.path;
  let fn: t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration | null = null;

  if (bindingPath.isFunctionDeclaration()) {
    fn = bindingPath.node;
  } else if (bindingPath.isVariableDeclarator()) {
    const init = bindingPath.node.init;
    if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
      fn = init;
    }
  }

  if (!fn || fn.params.length === 0) return;

  const firstParam = fn.params[0];

  if (t.isObjectPattern(firstParam)) {
    analyzeDestructuredParam(firstParam, eventName, componentName, validProperties, violations);
  } else if (t.isIdentifier(firstParam)) {
    const body = fn.body;
    if (t.isBlockStatement(body) || t.isExpression(body)) {
      analyzeParameterAccess(firstParam.name, body, eventName, componentName, validProperties, violations);
    }
  }
}

// ---------------------------------------------------------------------------
// Handler analysis
// ---------------------------------------------------------------------------

/**
 * Analyze a JSX attribute that is an event handler prop.
 */
function analyzeEventHandlerAttribute(
  attr: t.JSXAttribute,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  jsxPath: NodePath<t.JSXOpeningElement>,
  violations: Violation[]
): void {
  if (!attr.value || !t.isJSXExpressionContainer(attr.value)) return;

  const expr = attr.value.expression;
  if (t.isJSXEmptyExpression(expr)) return;

  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) {
    analyzeCallbackFunction(expr, eventName, componentName, validProperties, violations);
  } else if (t.isIdentifier(expr)) {
    analyzeNamedHandler(expr, eventName, componentName, validProperties, jsxPath, violations);
  }
  // MemberExpression (e.g., props.handleClick) — skip
}

/**
 * Analyze an inline arrow or function expression callback.
 */
function analyzeCallbackFunction(
  fn: t.ArrowFunctionExpression | t.FunctionExpression,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  violations: Violation[]
): void {
  if (fn.params.length === 0) return;

  const firstParam = fn.params[0];

  if (t.isObjectPattern(firstParam)) {
    analyzeDestructuredParam(firstParam, eventName, componentName, validProperties, violations);
  } else if (t.isIdentifier(firstParam)) {
    analyzeParameterAccess(firstParam.name, fn.body, eventName, componentName, validProperties, violations);
  }
  // RestElement or other patterns — skip
}

/**
 * Analyze destructured event parameter like ({ record, cancel }) or ({ data: row }).
 */
function analyzeDestructuredParam(
  pattern: t.ObjectPattern,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  violations: Violation[]
): void {
  for (const prop of pattern.properties) {
    if (t.isRestElement(prop)) continue;
    if (!t.isObjectProperty(prop)) continue;

    // Get the key name (the property being destructured from the event object)
    let keyName: string | null = null;
    if (t.isIdentifier(prop.key)) {
      keyName = prop.key.name;
    } else if (t.isStringLiteral(prop.key)) {
      keyName = prop.key.value;
    }

    if (!keyName) continue;
    if (validProperties.has(keyName)) continue;

    const suggestion = findClosestMatch(keyName, validProperties);
    const validList = Array.from(validProperties).join(', ');

    violations.push({
      rule: RULE_NAME,
      severity: 'high',
      line: prop.loc?.start.line || 0,
      column: prop.loc?.start.column || 0,
      message: `Destructured property "${keyName}" does not exist on ${componentName} "${eventName}" event. Valid properties: ${validList}`,
      suggestion: suggestion
        ? { text: `Did you mean "${suggestion}"?`, example: `({ ${suggestion} }) => { ... }` }
        : { text: `Valid properties for ${eventName}: ${validList}` },
    });
  }
}

/**
 * Analyze member access on the event parameter (e.g., e.data, e.record).
 * Only checks first-level property access.
 */
function analyzeParameterAccess(
  paramName: string,
  body: t.Expression | t.BlockStatement,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  violations: Violation[]
): void {
  // Wrap expression body in a temporary structure for uniform traversal
  const bodyNode = t.isBlockStatement(body) ? body : t.expressionStatement(body);
  const tempFile = t.file(t.program([t.isStatement(bodyNode) ? bodyNode : t.expressionStatement(bodyNode)]));

  const seen = new Set<string>();

  traverse(tempFile, {
    MemberExpression(innerPath: NodePath<t.MemberExpression>) {
      if (!t.isIdentifier(innerPath.node.object) || innerPath.node.object.name !== paramName) return;
      if (innerPath.node.computed) return;
      if (!t.isIdentifier(innerPath.node.property)) return;

      const accessedProp = innerPath.node.property.name;
      if (validProperties.has(accessedProp)) return;

      // Deduplicate: only report each wrong property once per handler
      const key = `${accessedProp}`;
      if (seen.has(key)) return;
      seen.add(key);

      const suggestion = findClosestMatch(accessedProp, validProperties);
      const validList = Array.from(validProperties).join(', ');

      violations.push({
        rule: RULE_NAME,
        severity: 'high',
        line: innerPath.node.loc?.start.line || 0,
        column: innerPath.node.loc?.start.column || 0,
        message: `Property "${accessedProp}" does not exist on ${componentName} "${eventName}" event parameter. Valid properties: ${validList}`,
        suggestion: suggestion
          ? { text: `Did you mean "${suggestion}"?`, example: `${paramName}.${suggestion}` }
          : { text: `Valid properties for ${eventName}: ${validList}` },
      });
    },
  });
}

/**
 * Attempt to resolve a named function reference and analyze its parameters.
 */
function analyzeNamedHandler(
  identifier: t.Identifier,
  eventName: string,
  componentName: string,
  validProperties: Set<string>,
  jsxPath: NodePath<t.JSXOpeningElement>,
  violations: Violation[]
): void {
  const binding = jsxPath.scope.getBinding(identifier.name);
  if (!binding) return;

  const bindingPath = binding.path;
  let fn: t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration | null = null;

  if (bindingPath.isFunctionDeclaration()) {
    fn = bindingPath.node;
  } else if (bindingPath.isVariableDeclarator()) {
    const init = bindingPath.node.init;
    if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
      fn = init;
    }
  }

  if (!fn || fn.params.length === 0) return;

  const firstParam = fn.params[0];

  if (t.isObjectPattern(firstParam)) {
    analyzeDestructuredParam(firstParam, eventName, componentName, validProperties, violations);
  } else if (t.isIdentifier(firstParam)) {
    const body = fn.body;
    if (t.isBlockStatement(body) || t.isExpression(body)) {
      analyzeParameterAccess(firstParam.name, body, eventName, componentName, validProperties, violations);
    }
  }
}
