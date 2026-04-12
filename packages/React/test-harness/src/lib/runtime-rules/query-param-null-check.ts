import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { ComponentSpec, ComponentQueryParameterValue } from '@memberjunction/interactive-component-types';

/**
 * Rule: query-param-null-check
 *
 * Enhances query parameter validation to catch:
 * - Passing null literal to a required query parameter
 * - Passing an array expression to a parameter that expects a scalar type
 * - Passing a state variable initialized with a wrong type (e.g., useState(true) for int param)
 *
 * Severity: high
 * Applies to: all components
 */

/** Scalar SQL types that do not accept array values */
const SCALAR_SQL_TYPES = new Set([
  'nvarchar', 'varchar', 'char', 'nchar', 'text', 'ntext',
  'int', 'bigint', 'smallint', 'tinyint',
  'decimal', 'numeric', 'float', 'real', 'money', 'smallmoney',
  'bit',
  'date', 'datetime', 'datetime2', 'smalldatetime', 'datetimeoffset', 'time',
  'uniqueidentifier',
  'string', 'number', 'boolean', // JS type names sometimes used
]);

/**
 * Maps a parameter's expected SQL/JS type to a JS category for init-value validation.
 */
function expectedJsCategory(paramType: string | undefined): string | null {
  if (!paramType) return null;
  const lower = paramType.toLowerCase().replace(/\(.*\)/, '').trim();

  const numericTypes = new Set([
    'int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric',
    'float', 'real', 'money', 'smallmoney', 'number',
  ]);
  const stringTypes = new Set([
    'nvarchar', 'varchar', 'char', 'nchar', 'text', 'ntext',
    'uniqueidentifier', 'string',
  ]);
  const boolTypes = new Set(['bit', 'boolean']);

  if (numericTypes.has(lower)) return 'number';
  if (stringTypes.has(lower)) return 'string';
  if (boolTypes.has(lower)) return 'boolean';
  return null;
}

/**
 * Determines the JS type category of a literal AST node.
 */
function getLiteralCategory(node: t.Expression | t.SpreadElement | t.JSXNamespacedName | t.ArgumentPlaceholder): string | null {
  if (t.isNumericLiteral(node)) return 'number';
  if (t.isStringLiteral(node)) return 'string';
  if (t.isBooleanLiteral(node)) return 'boolean';
  if (t.isNullLiteral(node)) return 'null';
  if (t.isTemplateLiteral(node)) return 'string';
  return null;
}

/**
 * Finds the query definition from the component spec by name.
 */
function findQuerySpec(
  componentSpec: ComponentSpec | undefined,
  queryName: string,
): { parameters?: ComponentQueryParameterValue[] } | undefined {
  if (!componentSpec?.dataRequirements?.queries) return undefined;
  return componentSpec.dataRequirements.queries.find(
    (q) => q.name === queryName,
  );
}

/**
 * Tracks useState initial values for identifiers in scope.
 * Returns a map of variable name -> { category, literal description }.
 */
function collectUseStateInits(
  ast: t.File,
): Map<string, { category: string; description: string }> {
  const stateInits = new Map<string, { category: string; description: string }>();

  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      // Match: const [foo, setFoo] = useState(initialValue)
      if (!t.isArrayPattern(path.node.id)) return;
      const init = path.node.init;
      if (!init) return;
      if (!t.isCallExpression(init)) return;
      if (!t.isIdentifier(init.callee) || init.callee.name !== 'useState') return;

      // Get the state variable name (first element of destructured array)
      const firstEl = path.node.id.elements[0];
      if (!t.isIdentifier(firstEl)) return;

      if (init.arguments.length > 0) {
        const arg = init.arguments[0];
        const category = getLiteralCategory(arg);
        if (category && category !== 'null') {
          let description: string;
          if (t.isNumericLiteral(arg)) description = String(arg.value);
          else if (t.isStringLiteral(arg)) description = `"${arg.value}"`;
          else if (t.isBooleanLiteral(arg)) description = String(arg.value);
          else description = category;

          stateInits.set(firstEl.name, { category, description });
        }
      }
    },
    noScope: true,
  });

  return stateInits;
}

export const queryParamNullCheckRule: LintRule = {
  name: 'query-param-null-check',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    // Pre-collect useState initializers for type checking
    const stateInits = collectUseStateInits(ast);

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        // Match utilities.rq.RunQuery(...)
        if (!isRunQueryCall(path.node.callee)) return;

        const runQueryArg = path.node.arguments[0];
        if (!t.isObjectExpression(runQueryArg)) return;

        // Extract QueryName and Parameters from the call
        const { queryName, parametersNode } = extractRunQueryInfo(runQueryArg);
        if (!queryName || !parametersNode) return;
        if (!t.isObjectExpression(parametersNode.value)) return;

        const querySpec = findQuerySpec(componentSpec, queryName);
        if (!querySpec?.parameters) return;

        // Build a map of spec params by name (case-insensitive)
        const specParamMap = new Map<string, ComponentQueryParameterValue>();
        for (const p of querySpec.parameters) {
          specParamMap.set(p.name.toLowerCase(), p);
        }

        // Validate each provided parameter
        for (const prop of parametersNode.value.properties) {
          if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

          const paramName = prop.key.name;
          const specParam = specParamMap.get(paramName.toLowerCase());
          if (!specParam) continue;

          validateParamValue(prop, paramName, specParam, stateInits, violations);
        }
      },
    });

    return violations;
  },
};

/**
 * Checks if a callee node matches utilities.rq.RunQuery.
 */
function isRunQueryCall(callee: t.Expression | t.V8IntrinsicIdentifier): boolean {
  return (
    t.isMemberExpression(callee) &&
    t.isMemberExpression(callee.object) &&
    t.isIdentifier(callee.object.object) &&
    callee.object.object.name === 'utilities' &&
    t.isIdentifier(callee.object.property) &&
    callee.object.property.name === 'rq' &&
    t.isIdentifier(callee.property) &&
    callee.property.name === 'RunQuery'
  );
}

/**
 * Extracts QueryName string and Parameters property node from a RunQuery config object.
 */
function extractRunQueryInfo(
  configObj: t.ObjectExpression,
): { queryName: string | null; parametersNode: t.ObjectProperty | null } {
  let queryName: string | null = null;
  let parametersNode: t.ObjectProperty | null = null;

  for (const prop of configObj.properties) {
    if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;
    if (prop.key.name === 'QueryName' && t.isStringLiteral(prop.value)) {
      queryName = prop.value.value;
    } else if (prop.key.name === 'Parameters') {
      parametersNode = prop;
    }
  }

  return { queryName, parametersNode };
}

/**
 * Validates a single parameter value against its spec definition.
 * Checks for null literals, array-to-scalar mismatches, and useState type mismatches.
 */
function validateParamValue(
  prop: t.ObjectProperty,
  paramName: string,
  specParam: ComponentQueryParameterValue,
  stateInits: Map<string, { category: string; description: string }>,
  violations: Violation[],
): void {
  const value = prop.value;
  const isRequired = specParam.isRequired || specParam.value === '@runtime';

  // Check 1: null literal on a required parameter
  if (t.isNullLiteral(value) && isRequired) {
    violations.push({
      rule: 'query-param-null-check',
      severity: 'high',
      line: prop.loc?.start.line ?? 0,
      column: prop.loc?.start.column ?? 0,
      message: `Required query parameter "${paramName}" is set to null. This will cause the query to fail or return unexpected results.`,
      code: `${paramName}: null`,
      suggestion: {
        text: `Provide a valid value for "${paramName}" or add a null guard before calling RunQuery`,
        example: `${paramName}: ${specParam.testValue ? `'${specParam.testValue}'` : "'value'"}`,
      },
    });
    return;
  }

  // Check 2: array expression for a scalar parameter
  if (t.isArrayExpression(value)) {
    const paramType = specParam.type?.toLowerCase().replace(/\(.*\)/, '').trim();
    if (!paramType || SCALAR_SQL_TYPES.has(paramType)) {
      violations.push({
        rule: 'query-param-null-check',
        severity: 'high',
        line: prop.loc?.start.line ?? 0,
        column: prop.loc?.start.column ?? 0,
        message: `Query parameter "${paramName}" expects a scalar value (type: ${specParam.type ?? 'scalar'}) but received an array. Pass a single value instead.`,
        code: `${paramName}: [...]`,
        suggestion: {
          text: `Pass a single value instead of an array`,
          example: `${paramName}: ${specParam.testValue ? `'${specParam.testValue}'` : "'value'"}`,
        },
      });
    }
    return;
  }

  // Check 3: useState variable with mismatched init type
  if (t.isIdentifier(value)) {
    const stateInfo = stateInits.get(value.name);
    if (!stateInfo) return;

    const expectedCategory = expectedJsCategory(specParam.type);
    if (!expectedCategory) return;

    if (stateInfo.category !== expectedCategory) {
      violations.push({
        rule: 'query-param-null-check',
        severity: 'high',
        line: prop.loc?.start.line ?? 0,
        column: prop.loc?.start.column ?? 0,
        message: `Query parameter "${paramName}" expects type "${specParam.type}" (${expectedCategory}) but state variable "${value.name}" is initialized as ${stateInfo.category} (${stateInfo.description}). This type mismatch may cause the query to fail.`,
        code: `${paramName}: ${value.name}`,
        suggestion: {
          text: `Initialize the state variable with a ${expectedCategory} value, or convert before passing`,
          example: expectedCategory === 'number'
            ? `useState(0)`
            : expectedCategory === 'string'
              ? `useState('')`
              : `useState(false)`,
        },
      });
    }
  }
}

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(queryParamNullCheckRule);
