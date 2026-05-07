import { traverse, NodePath, levenshteinDistance } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentProperty, ComponentEvent } from '@memberjunction/interactive-component-types';
import { ComponentMetadataEngine } from '@memberjunction/core-entities';

/**
 * Rule: child-component-prop-validation
 *
 * Validates props passed to child/embedded components in JSX against the
 * dependency component specs. Detects:
 *   - Nonexistent prop names (no matching property in child spec)
 *   - Prop name typos (Levenshtein distance <= 2)
 *   - Prop name case mismatches (case-insensitive match exists)
 *   - Type mismatches (string passed where number expected, etc.)
 *
 * Child component specs are sourced from componentSpec.dependencies.
 *
 * Severity: high (nonexistent props, type mismatches), medium (case mismatches)
 * Applies to: all components
 */

/** Props that are always valid on any child component and should be skipped */
const STANDARD_CHILD_PROPS = new Set([
  'utilities',
  'styles',
  'components',
  'callbacks',
  'savedUserSettings',
  'onSaveUserSettings',
  'key',
  'ref',
  'children',
]);


/**
 * Build a set of event-derived prop names from a component's events array.
 * Events like { name: 'rowClick' } produce 'onRowClick'.
 */
function buildEventPropNames(events: ComponentEvent[] | undefined): Set<string> {
  const result = new Set<string>();
  if (!events) return result;
  for (const event of events) {
    if (event.name) {
      result.add(event.name);
      const onPrefixed = 'on' + event.name.charAt(0).toUpperCase() + event.name.slice(1);
      result.add(onPrefixed);
    }
  }
  return result;
}

/**
 * Attempt to infer the runtime type of a JSX attribute value expression.
 * Returns a simple type string: 'string', 'number', 'boolean', 'array',
 * 'object', 'function', or null if unknown.
 *
 * For identifiers, traces back through the AST looking for useState
 * initializers to determine the type.
 */
function inferExpressionType(
  expr: t.Expression | t.JSXEmptyExpression,
  variableTypes: Map<string, string>,
): string | null {
  if (t.isStringLiteral(expr) || t.isTemplateLiteral(expr)) return 'string';
  if (t.isNumericLiteral(expr)) return 'number';
  if (t.isBooleanLiteral(expr)) return 'boolean';
  if (t.isArrayExpression(expr)) return 'array';
  if (t.isObjectExpression(expr)) return 'object';
  if (t.isArrowFunctionExpression(expr) || t.isFunctionExpression(expr)) return 'function';
  if (t.isNullLiteral(expr)) return null;

  if (t.isIdentifier(expr)) {
    return variableTypes.get(expr.name) ?? null;
  }

  return null;
}

/**
 * Infer type from a value AST node (used for useState initial values).
 */
function inferValueType(node: t.Expression | t.SpreadElement): string | null {
  if (t.isStringLiteral(node) || t.isTemplateLiteral(node)) return 'string';
  if (t.isNumericLiteral(node)) return 'number';
  if (t.isBooleanLiteral(node)) return 'boolean';
  if (t.isArrayExpression(node)) return 'array';
  if (t.isObjectExpression(node)) return 'object';
  if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) return 'function';
  return null;
}

/**
 * Normalize a spec property type string to one of the simple types
 * we use for comparison.
 */
function normalizeSpecType(specType: string): string | null {
  const lower = specType.toLowerCase().trim();
  if (lower === 'string') return 'string';
  if (lower === 'number' || lower === 'integer' || lower === 'float') return 'number';
  if (lower === 'boolean' || lower === 'bool') return 'boolean';
  if (lower === 'array' || lower.startsWith('array<') || lower.endsWith('[]')) return 'array';
  if (lower === 'object') return 'object';
  if (lower === 'function') return 'function';
  if (lower === 'any') return null; // 'any' matches everything
  return null; // complex or unknown types - skip checking
}

/**
 * Check if two types are compatible. Returns true if they match or if
 * either side is unknown/any.
 */
function typesAreCompatible(actualType: string, expectedType: string): boolean {
  if (actualType === expectedType) return true;
  // Arrays are objects in JavaScript — allow object where array is expected and vice versa
  if ((actualType === 'object' && expectedType === 'array') ||
      (actualType === 'array' && expectedType === 'object')) return true;
  // JSX string attributes are common for numeric props (e.g., height="300")
  if (actualType === 'string' && expectedType === 'number') return true;
  return false;
}

/**
 * Find the closest matching property name from a list using Levenshtein distance.
 */
function findClosestPropName(
  attrName: string,
  validNames: string[],
): { name: string; distance: number } | null {
  let bestMatch: { name: string; distance: number } | null = null;
  for (const name of validNames) {
    const dist = levenshteinDistance(attrName, name);
    if (dist <= 2 && (!bestMatch || dist < bestMatch.distance)) {
      bestMatch = { name, distance: dist };
    }
  }
  return bestMatch;
}

interface ChildComponentInfo {
  properties: ComponentProperty[];
  events: ComponentEvent[] | undefined;
  propertyNames: Set<string>;
  eventPropNames: Set<string>;
  propertyByNameLower: Map<string, ComponentProperty>;
}

/**
 * Try to load component properties and events from the ComponentMetadataEngine registry.
 * Returns the resolved properties and events, or undefined if the registry is not
 * available or the component was not found.
 */
function tryRegistryLookup(
  dep: ComponentSpec,
): { properties: ComponentProperty[]; events: ComponentEvent[] | undefined } | undefined {
  try {
    const engine = ComponentMetadataEngine.Instance;
    // Only attempt lookup if the engine has been initialized (Config() was called)
    if (!engine.Components || engine.Components.length === 0) {
      return undefined;
    }

    const registryComponent = engine.FindComponent(
      dep.name,
      dep.namespace,
      dep.registry,
    );
    if (registryComponent?.spec?.properties?.length) {
      return {
        properties: registryComponent.spec.properties,
        events: registryComponent.spec.events,
      };
    }
  } catch {
    // DB not available or engine not initialized — fall through
  }

  return undefined;
}

/**
 * Build a lookup map from dependency component name to its prop info.
 * Uses a 3-tier fallback:
 *   1. Primary: dep.properties/events from the spec's dependencies array
 *   2. Fallback 1: Registry lookup via ComponentMetadataEngine
 *   3. Fallback 2: Skip with a low-severity warning
 */
function buildDependencyMap(
  dependencies: ComponentSpec[] | undefined,
  warnings: Violation[],
): Map<string, ChildComponentInfo> {
  const result = new Map<string, ChildComponentInfo>();
  if (!dependencies) return result;

  for (const dep of dependencies) {
    if (!dep.name) continue;

    let properties = dep.properties ?? [];
    let events: ComponentEvent[] | undefined = dep.events;

    // Fallback 1: If no properties from spec, try the registry
    if (properties.length === 0) {
      const registryResult = tryRegistryLookup(dep);
      if (registryResult) {
        properties = registryResult.properties;
        events = registryResult.events;
      }
    }

    // Fallback 2: Still no properties — emit a warning and skip this dependency
    if (properties.length === 0) {
      warnings.push({
        rule: 'child-component-prop-validation',
        severity: 'low',
        line: 0,
        column: 0,
        message:
          `Unable to validate props for <${dep.name}> — no property metadata available ` +
          `from spec or registry. Ensure the component spec includes property definitions ` +
          `for accurate validation.`,
      });
      continue;
    }

    const propertyNames = new Set<string>();
    const propertyByNameLower = new Map<string, ComponentProperty>();

    for (const prop of properties) {
      propertyNames.add(prop.name);
      propertyByNameLower.set(prop.name.toLowerCase(), prop);
    }

    result.set(dep.name, {
      properties,
      events,
      propertyNames,
      eventPropNames: buildEventPropNames(events),
      propertyByNameLower,
    });
  }

  return result;
}

/**
 * Collect variable type information from useState calls throughout the AST.
 * Maps variable name -> inferred type string.
 */
function collectVariableTypes(ast: t.File): Map<string, string> {
  const variableTypes = new Map<string, string>();

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      // Detect: const [foo, setFoo] = useState(initialValue)
      if (
        t.isArrayPattern(path.node.id) &&
        t.isCallExpression(path.node.init) &&
        t.isIdentifier(path.node.init.callee) &&
        path.node.init.callee.name === 'useState'
      ) {
        const elements = path.node.id.elements;
        if (elements.length >= 1 && t.isIdentifier(elements[0]) && path.node.init.arguments.length >= 1) {
          const varName = elements[0].name;
          const initArg = path.node.init.arguments[0];
          if (t.isExpression(initArg)) {
            const inferredType = inferValueType(initArg);
            if (inferredType) {
              variableTypes.set(varName, inferredType);
            }
          }
        }
      }
    },
  });

  return variableTypes;
}

/**
 * Validate the type of a prop value against the expected type from the child spec.
 */
function validatePropType(
  violations: Violation[],
  tagName: string,
  attrName: string,
  attr: t.JSXAttribute,
  childInfo: ChildComponentInfo,
  variableTypes: Map<string, string>,
  line: number,
  column: number,
): void {
  // Find the property spec
  const propSpec = childInfo.properties.find((p) => p.name === attrName);
  if (!propSpec) return;

  const expectedType = normalizeSpecType(propSpec.type);
  if (!expectedType) return; // Can't determine expected type or it's 'any'

  // Get the attribute value expression
  const valueExpr = extractAttributeValueExpression(attr);
  if (!valueExpr) return;

  const actualType = inferExpressionType(valueExpr, variableTypes);
  if (!actualType) return; // Can't determine actual type

  if (!typesAreCompatible(actualType, expectedType)) {
    violations.push({
      rule: 'child-component-prop-validation',
      severity: 'high',
      line,
      column,
      message:
        `Type mismatch on prop "${attrName}" of <${tagName}>: ` +
        `expected "${expectedType}" but got "${actualType}".`,
      suggestion: {
        text: `Ensure the value passed to "${attrName}" is of type "${expectedType}".`,
        example: buildTypeFixExample(tagName, attrName, expectedType, actualType),
      },
    });
  }
}

/**
 * Extract the expression from a JSX attribute value.
 */
function extractAttributeValueExpression(
  attr: t.JSXAttribute,
): t.Expression | t.JSXEmptyExpression | null {
  const value = attr.value;
  if (!value) return null; // Boolean shorthand like <Comp disabled />

  if (t.isJSXExpressionContainer(value)) {
    return value.expression;
  }
  if (t.isStringLiteral(value)) {
    return value;
  }
  return null;
}

/**
 * Build a helpful example showing how to fix a type mismatch.
 */
function buildTypeFixExample(
  tagName: string,
  propName: string,
  expectedType: string,
  actualType: string,
): string {
  const conversions: Record<string, Record<string, string>> = {
    number: {
      string: `// Convert string to number:\nconst parsed = Number(value);\n<${tagName} ${propName}={parsed} />`,
    },
    string: {
      number: `// Convert number to string:\n<${tagName} ${propName}={String(value)} />`,
      array: `// If you need a string, join the array:\n<${tagName} ${propName}={values.join(',')} />`,
    },
    boolean: {
      number: `// Convert to boolean:\n<${tagName} ${propName}={value > 0} />`,
      string: `// Convert to boolean:\n<${tagName} ${propName}={value === 'true'} />`,
    },
    array: {
      string: `// Convert string to array:\n<${tagName} ${propName}={value.split(',')} />`,
    },
  };

  return conversions[expectedType]?.[actualType]
    ?? `<${tagName} ${propName}={/* provide a ${expectedType} value */} />`;
}

@RegisterClass(BaseLintRule, 'child-component-prop-validation')
export class ChildComponentPropValidationRule extends BaseLintRule {
  get Name() { return 'child-component-prop-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // If no dependencies, nothing to validate
    if (!componentSpec?.dependencies || componentSpec.dependencies.length === 0) {
      return violations;
    }

    const depMap = buildDependencyMap(componentSpec.dependencies, violations);
    if (depMap.size === 0) return violations;

    // Collect variable types from useState calls for type-checking
    const variableTypes = collectVariableTypes(ast);

    traverse(ast, {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
        // Only handle simple <ComponentName ... /> elements
        if (!t.isJSXIdentifier(path.node.name)) return;

        const tagName = path.node.name.name;
        const childInfo = depMap.get(tagName);
        if (!childInfo) return; // Not a known dependency component

        // Full list used for typo detection (accepts both raw event names and on-prefixed)
        const allValidPropNames = [
          ...Array.from(childInfo.propertyNames),
          ...Array.from(childInfo.eventPropNames),
        ];

        // Display list for error messages: only show on-prefixed callback form of events
        const displayPropNames = [
          ...Array.from(childInfo.propertyNames),
          ...Array.from(childInfo.eventPropNames).filter((n) => n.startsWith('on')),
        ];

        for (const attr of path.node.attributes) {
          // Skip spread attributes like {...props}
          if (t.isJSXSpreadAttribute(attr)) continue;

          const attrName = attr.name && t.isJSXIdentifier(attr.name) ? attr.name.name : null;
          if (!attrName) continue;

          // Skip standard props that are always valid
          if (STANDARD_CHILD_PROPS.has(attrName)) continue;

          // Skip event prop names
          if (childInfo.eventPropNames.has(attrName)) continue;

          const line = attr.loc?.start.line ?? 0;
          const column = attr.loc?.start.column ?? 0;

          // Check if the prop exists exactly
          if (childInfo.propertyNames.has(attrName)) {
            // Prop exists -- check type compatibility
            validatePropType(
              violations,
              tagName,
              attrName,
              attr,
              childInfo,
              variableTypes,
              line,
              column,
            );
            continue;
          }

          // Prop name not found -- check for case mismatch
          const lowerAttrName = attrName.toLowerCase();
          const caseMatch = childInfo.propertyByNameLower.get(lowerAttrName);
          if (caseMatch) {
            violations.push({
              rule: 'child-component-prop-validation',
              severity: 'medium',
              line,
              column,
              message:
                `Prop "${attrName}" on <${tagName}> has incorrect casing. ` +
                `The correct prop name is "${caseMatch.name}".`,
              suggestion: {
                text: `Change "${attrName}" to "${caseMatch.name}"`,
                example: `<${tagName} ${caseMatch.name}={...} />`,
              },
            });
            continue;
          }

          // Check for typo via Levenshtein distance
          const typoMatch = findClosestPropName(attrName, allValidPropNames);
          if (typoMatch) {
            violations.push({
              rule: 'child-component-prop-validation',
              severity: 'high',
              line,
              column,
              message:
                `Prop "${attrName}" does not exist on <${tagName}>. ` +
                `Did you mean "${typoMatch.name}"?`,
              suggestion: {
                text: `Change "${attrName}" to "${typoMatch.name}"`,
                example: `<${tagName} ${typoMatch.name}={...} />`,
              },
            });
            continue;
          }

          // No match at all -- nonexistent prop
          const availableProps = displayPropNames.length > 0
            ? ` Available props: ${displayPropNames.join(', ')}.`
            : '';

          violations.push({
            rule: 'child-component-prop-validation',
            severity: 'high',
            line,
            column,
            message:
              `Prop "${attrName}" does not exist on <${tagName}>.${availableProps}`,
            suggestion: {
              text: `Remove "${attrName}" or use one of the available props defined in the ${tagName} component spec.`,
              example: displayPropNames.length > 0
                ? `<${tagName} ${displayPropNames[0]}={...} />`
                : `<${tagName} />`,
            },
          });
        }
      },
    });

    return violations;
  }
}
