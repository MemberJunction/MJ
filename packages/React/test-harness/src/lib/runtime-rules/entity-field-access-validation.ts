import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { TypeContext } from '../type-context';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: entity-field-access-validation
 *
 * Enhanced validation of field access on RunView entity results. Catches:
 * - Nonexistent fields (high severity, with closest-match suggestion)
 * - Field name typos via Levenshtein distance (high severity)
 * - Case mismatches like `m.email` vs `m.Email` (medium severity)
 * - Type coercion on GUID fields like `parseInt(m.ID)` (medium severity)
 * - Optional chaining expressions like `m?.FieldName`
 * - All array method callbacks: map, filter, reduce, sort, find, some, every, forEach
 *
 * Severity: high (nonexistent/typo), medium (case mismatch, type coercion)
 * Applies to: all components
 */

/** Array methods whose callbacks receive row items as the first parameter */
const ARRAY_METHODS = ['map', 'forEach', 'filter', 'find', 'some', 'every', 'reduce', 'sort', 'flatMap'];

/**
 * Computes Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

/**
 * Finds the closest matching field name from a set of valid fields.
 * Returns null if no reasonable match is found (distance > 3 or > 50% of name length).
 */
function findClosestField(fieldName: string, validFields: Set<string>): string | null {
  let bestMatch: string | null = null;
  let bestDistance = Infinity;

  for (const valid of validFields) {
    const dist = levenshteinDistance(fieldName.toLowerCase(), valid.toLowerCase());
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = valid;
    }
  }

  const maxAllowed = Math.max(3, Math.floor(fieldName.length * 0.5));
  if (bestMatch && bestDistance > 0 && bestDistance <= maxAllowed) {
    return bestMatch;
  }
  return null;
}

/**
 * Checks whether a field name is a case mismatch against a valid field.
 * Returns the correct field name if it's a case-only mismatch, null otherwise.
 */
function findCaseMismatch(fieldName: string, validFields: Set<string>): string | null {
  for (const valid of validFields) {
    if (valid.toLowerCase() === fieldName.toLowerCase() && valid !== fieldName) {
      return valid;
    }
  }
  return null;
}

/**
 * Gets the SQL type for a field from the TypeContext entity field cache.
 */
function getFieldSqlType(
  entityName: string,
  fieldName: string,
  typeContext: TypeContext
): string | undefined {
  const fields = typeContext.getEntityFieldTypesSync(entityName);
  const fieldInfo = fields.get(fieldName);
  return fieldInfo?.sqlType;
}

/**
 * Numeric coercion functions that don't make sense on GUIDs.
 */
const NUMERIC_COERCION_FUNCTIONS = new Set([
  'parseInt', 'parseFloat', 'Number',
]);

/**
 * Resolves the identifier being accessed through optional chaining.
 * For `m?.FieldName` the AST is OptionalMemberExpression with object=m, property=FieldName.
 * For `m.FieldName` it's a regular MemberExpression.
 * Returns { objectName, propertyName } or null if the pattern doesn't match.
 */
function resolveMemberAccess(
  node: t.MemberExpression | t.OptionalMemberExpression
): { objectName: string; propertyName: string; propertyNode: t.Node } | null {
  if (node.computed) return null;
  if (!t.isIdentifier(node.property)) return null;

  // Direct access: m.Field or m?.Field
  if (t.isIdentifier(node.object)) {
    return {
      objectName: node.object.name,
      propertyName: node.property.name,
      propertyNode: node.property,
    };
  }
  return null;
}

/**
 * Extracts the callback parameter name for array iteration methods.
 * For `reduce`, the accumulator is the first param and the item is the second.
 * For `sort`, both params are items.
 * For all others, the first param is the item.
 */
function extractIterationParamNames(
  callback: t.ArrowFunctionExpression | t.FunctionExpression,
  methodName: string
): string[] {
  const params: string[] = [];

  if (methodName === 'reduce') {
    // reduce(callback, initialValue) — callback(accumulator, currentValue)
    if (callback.params.length >= 2 && t.isIdentifier(callback.params[1])) {
      params.push(callback.params[1].name);
    }
  } else if (methodName === 'sort') {
    // sort((a, b) => ...) — both a and b are items
    for (const param of callback.params) {
      if (t.isIdentifier(param)) {
        params.push(param.name);
      }
    }
  } else {
    // map, filter, find, forEach, some, every, flatMap — first param is item
    if (callback.params.length >= 1 && t.isIdentifier(callback.params[0])) {
      params.push(callback.params[0].name);
    }
  }

  return params;
}

export const entityFieldAccessValidationRule: LintRule = {
  name: 'entity-field-access-validation',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec) => {
    const violations: Violation[] = [];

    // Build entity field maps from metadata (via TypeContext) and spec fallback
    const entityFieldsMap = new Map<string, Set<string>>();
    const typeContext = new TypeContext(componentSpec);

    // Load from Metadata first
    if (componentSpec?.dataRequirements?.entities) {
      for (const entityReq of componentSpec.dataRequirements.entities) {
        const fields = typeContext.getEntityFieldTypesSync(entityReq.name);
        if (fields.size > 0) {
          entityFieldsMap.set(entityReq.name, new Set(fields.keys()));
        } else if (entityReq.fieldMetadata && entityReq.fieldMetadata.length > 0) {
          // Fallback to spec fieldMetadata when no DB connection
          entityFieldsMap.set(
            entityReq.name,
            new Set(entityReq.fieldMetadata.map(f => f.name))
          );
        }
      }
    }

    // If we couldn't load any entity metadata at all, skip
    if (entityFieldsMap.size === 0) {
      return violations;
    }

    // Track RunView result variables: varName -> entityName
    const runViewResultVars = new Map<string, string>();
    // Track .Results arrays: varName -> entityName
    const entityArrayVars = new Map<string, string>();

    /**
     * Validates a single field access on an entity row variable.
     */
    function validateFieldAccess(
      node: t.MemberExpression | t.OptionalMemberExpression,
      paramName: string,
      entityName: string
    ): void {
      const access = resolveMemberAccess(node);
      if (!access || access.objectName !== paramName) return;

      const { propertyName } = access;
      const validFields = entityFieldsMap.get(entityName);
      if (!validFields) return;

      // Field exists — no violation
      if (validFields.has(propertyName)) return;

      // Check for case mismatch first (medium severity)
      const caseFix = findCaseMismatch(propertyName, validFields);
      if (caseFix) {
        violations.push(
          createViolation(
            'entity-field-access-validation',
            'medium',
            node,
            `Field "${propertyName}" on entity "${entityName}" has incorrect casing. Did you mean "${caseFix}"?`,
            `${paramName}.${propertyName}`,
            {
              text: `Use the correct casing: "${caseFix}". MemberJunction entity fields use PascalCase.`,
              example: `// Change:\n${paramName}.${propertyName}\n// To:\n${paramName}.${caseFix}`,
            }
          )
        );
        return;
      }

      // Check for close typo via Levenshtein (high severity)
      const closest = findClosestField(propertyName, validFields);
      const availableFields = Array.from(validFields).slice(0, 10);
      const moreText = validFields.size > 10 ? ` and ${validFields.size - 10} more` : '';

      if (closest) {
        violations.push(
          createViolation(
            'entity-field-access-validation',
            'high',
            node,
            `Field "${propertyName}" does not exist on entity "${entityName}". Did you mean "${closest}"? Available fields: ${availableFields.join(', ')}${moreText}`,
            `${paramName}.${propertyName}`,
            {
              text: `Replace "${propertyName}" with "${closest}".`,
              example: `// Change:\n${paramName}.${propertyName}\n// To:\n${paramName}.${closest}`,
            }
          )
        );
      } else {
        violations.push(
          createViolation(
            'entity-field-access-validation',
            'high',
            node,
            `Field "${propertyName}" does not exist on entity "${entityName}". Available fields: ${availableFields.join(', ')}${moreText}`,
            `${paramName}.${propertyName}`,
            {
              text: `Use one of the valid fields from the "${entityName}" entity.`,
            }
          )
        );
      }
    }

    /**
     * Checks for numeric coercion on GUID fields, e.g., parseInt(m.ID) where ID is uniqueidentifier.
     */
    function checkTypeCoercion(
      callNode: t.CallExpression,
      entityRowParams: Map<string, string>
    ): void {
      // Check if the call is parseInt/parseFloat/Number
      if (!t.isIdentifier(callNode.callee)) return;
      if (!NUMERIC_COERCION_FUNCTIONS.has(callNode.callee.name)) return;
      if (callNode.arguments.length === 0) return;

      const arg = callNode.arguments[0];
      if (!t.isMemberExpression(arg) && !t.isOptionalMemberExpression(arg)) return;

      const access = resolveMemberAccess(arg);
      if (!access) return;

      const entityName = entityRowParams.get(access.objectName);
      if (!entityName) return;

      // Check if the field exists and is a GUID type
      const sqlType = getFieldSqlType(entityName, access.propertyName, typeContext);
      if (sqlType && sqlType.toLowerCase() === 'uniqueidentifier') {
        violations.push(
          createViolation(
            'entity-field-access-validation',
            'medium',
            callNode,
            `${callNode.callee.name}(${access.objectName}.${access.propertyName}) coerces a uniqueidentifier (GUID) to a number. GUIDs are strings, not numeric values.`,
            truncateCode(`${callNode.callee.name}(${access.objectName}.${access.propertyName})`),
            {
              text: `"${access.propertyName}" is a uniqueidentifier field. Use it as a string directly — do not parse it as a number.`,
              example: `// Instead of:\n${callNode.callee.name}(${access.objectName}.${access.propertyName})\n// Use:\n${access.objectName}.${access.propertyName}  // Already a string`,
            }
          )
        );
      }
    }

    /**
     * Walks a callback body, validating all field accesses on known entity row params.
     */
    function validateCallbackBody(
      body: t.Node,
      paramNames: string[],
      entityName: string
    ): void {
      // Build a param lookup for this callback scope
      const entityRowParams = new Map<string, string>();
      for (const p of paramNames) {
        entityRowParams.set(p, entityName);
      }

      traverse(body, {
        MemberExpression(innerPath: NodePath<t.MemberExpression>) {
          const objName = t.isIdentifier(innerPath.node.object) ? innerPath.node.object.name : null;
          if (objName && entityRowParams.has(objName)) {
            validateFieldAccess(innerPath.node, objName, entityName);
          }
        },
        OptionalMemberExpression(innerPath: NodePath<t.OptionalMemberExpression>) {
          const objName = t.isIdentifier(innerPath.node.object) ? innerPath.node.object.name : null;
          if (objName && entityRowParams.has(objName)) {
            validateFieldAccess(innerPath.node, objName, entityName);
          }
        },
        CallExpression(innerPath: NodePath<t.CallExpression>) {
          checkTypeCoercion(innerPath.node, entityRowParams);
        },
        noScope: true,
      });
    }

    // Main traversal
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (!t.isIdentifier(path.node.id)) return;
        const varName = path.node.id.name;
        const init = path.node.init;
        if (!init) return;

        // Detect: const result = await utilities.rv.RunView({ EntityName: '...' })
        if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
          const call = init.argument;
          if (
            t.isMemberExpression(call.callee) &&
            t.isMemberExpression(call.callee.object) &&
            t.isIdentifier(call.callee.property) &&
            call.callee.property.name === 'RunView'
          ) {
            if (call.arguments.length > 0 && t.isObjectExpression(call.arguments[0])) {
              for (const prop of call.arguments[0].properties) {
                if (
                  t.isObjectProperty(prop) &&
                  t.isIdentifier(prop.key) &&
                  prop.key.name === 'EntityName' &&
                  t.isStringLiteral(prop.value)
                ) {
                  runViewResultVars.set(varName, prop.value.value);
                  break;
                }
              }
            }
          }
        }

        // Detect: const rows = result.Results  or  const rows = result?.Results
        if (t.isMemberExpression(init) || t.isOptionalMemberExpression(init)) {
          if (
            t.isIdentifier(init.object) &&
            t.isIdentifier(init.property) &&
            init.property.name === 'Results'
          ) {
            const sourceVar = init.object.name;
            const entityName = runViewResultVars.get(sourceVar);
            if (entityName) {
              entityArrayVars.set(varName, entityName);
            }
          }
        }
      },

      CallExpression(path: NodePath<t.CallExpression>) {
        if (
          !t.isMemberExpression(path.node.callee) &&
          !t.isOptionalMemberExpression(path.node.callee)
        ) {
          return;
        }

        const callee = path.node.callee;
        if (!t.isIdentifier(callee.property)) return;

        const methodName = callee.property.name;
        if (!ARRAY_METHODS.includes(methodName)) return;

        let entityName: string | undefined;

        // .map() etc. on a tracked array variable
        if (t.isIdentifier(callee.object)) {
          entityName = entityArrayVars.get(callee.object.name);
        }

        // .Results.map() — direct chaining on result.Results or result?.Results
        if (
          (t.isMemberExpression(callee.object) || t.isOptionalMemberExpression(callee.object)) &&
          t.isIdentifier(callee.object.object) &&
          t.isIdentifier(callee.object.property) &&
          callee.object.property.name === 'Results'
        ) {
          entityName = runViewResultVars.get(callee.object.object.name);
        }

        if (!entityName) return;
        if (path.node.arguments.length === 0) return;

        const callback = path.node.arguments[0];
        if (
          !t.isArrowFunctionExpression(callback) &&
          !t.isFunctionExpression(callback)
        ) {
          return;
        }

        const paramNames = extractIterationParamNames(callback, methodName);
        if (paramNames.length === 0) return;

        validateCallbackBody(callback.body, paramNames, entityName);
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(entityFieldAccessValidationRule);
