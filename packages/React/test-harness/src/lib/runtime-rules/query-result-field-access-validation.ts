import { traverse, NodePath, createViolation, truncateCode, findClosestMatch, findCaseMismatch, NUMERIC_COERCION_FUNCTIONS } from '../lint-utils';
import { RegisterClass } from '@memberjunction/global';
import * as t from '@babel/types';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { TypeContext } from '../type-context';
import { ComponentSpec } from '@memberjunction/interactive-component-types';

/**
 * Rule: query-result-field-access-validation
 *
 * Enhanced validation of field access on RunQuery results against spec fieldMetadata.
 * Catches:
 * - Nonexistent fields (high severity, with closest-match suggestion)
 * - Field name typos via Levenshtein distance (high severity)
 * - Case mismatches like `r.productname` vs `r.ProductName` (medium severity)
 * - Type coercion on GUID fields like `parseInt(r.ID)` (medium severity)
 * - Optional chaining expressions like `r?.FieldName`
 * - All array method callbacks: map, filter, reduce, sort, find, some, every, forEach
 *
 * Severity: high (nonexistent/typo), medium (case mismatch, type coercion)
 * Applies to: all components
 */

/** Array methods whose callbacks receive row items as the first parameter */
const ARRAY_METHODS = ['map', 'forEach', 'filter', 'find', 'some', 'every', 'reduce', 'sort', 'flatMap'];

/**
 * Resolves the identifier being accessed through optional chaining or regular member access.
 * Returns { objectName, propertyName } or null if the pattern doesn't match.
 */
function resolveMemberAccess(
  node: t.MemberExpression | t.OptionalMemberExpression
): { objectName: string; propertyName: string } | null {
  if (node.computed) return null;
  if (!t.isIdentifier(node.property)) return null;

  if (t.isIdentifier(node.object)) {
    return {
      objectName: node.object.name,
      propertyName: node.property.name,
    };
  }
  return null;
}


/**
 * Extracts the callback parameter name(s) for array iteration methods.
 * For `reduce`, the item is the second param. For `sort`, both are items.
 */
function extractIterationParamNames(
  callback: t.ArrowFunctionExpression | t.FunctionExpression,
  methodName: string
): string[] {
  const params: string[] = [];

  if (methodName === 'reduce') {
    if (callback.params.length >= 2 && t.isIdentifier(callback.params[1])) {
      params.push(callback.params[1].name);
    }
  } else if (methodName === 'sort') {
    for (const param of callback.params) {
      if (t.isIdentifier(param)) {
        params.push(param.name);
      }
    }
  } else {
    if (callback.params.length >= 1 && t.isIdentifier(callback.params[0])) {
      params.push(callback.params[0].name);
    }
  }

  return params;
}

@RegisterClass(BaseLintRule, 'query-result-field-access-validation')
export class QueryResultFieldAccessValidationRule extends BaseLintRule {
  get Name() { return 'query-result-field-access-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    // Skip if no data requirements with queries
    if (!componentSpec?.dataRequirements?.queries || componentSpec.dataRequirements.queries.length === 0) {
      return violations;
    }

    // Build a map of query names to their valid field names and field types
    const queryFieldsMap = new Map<string, Set<string>>();
    const queryFieldTypesMap = new Map<string, Map<string, string>>(); // queryName -> fieldName -> sqlType
    const typeContext = new TypeContext(componentSpec);

    for (const queryReq of componentSpec.dataRequirements.queries) {
      // Try TypeContext first (uses cached query.fields)
      const fields = typeContext.getQueryFieldTypes(queryReq.name, queryReq.categoryPath);
      if (fields && fields.size > 0) {
        queryFieldsMap.set(queryReq.name, new Set(fields.keys()));
        const typeMap = new Map<string, string>();
        for (const [name, info] of fields) {
          if (info.sqlType) {
            typeMap.set(name, info.sqlType);
          }
        }
        queryFieldTypesMap.set(queryReq.name, typeMap);
      } else if (queryReq.fields && queryReq.fields.length > 0) {
        // Fallback: use fields directly from spec
        queryFieldsMap.set(
          queryReq.name,
          new Set(queryReq.fields.map(f => f.name))
        );
        const typeMap = new Map<string, string>();
        for (const f of queryReq.fields) {
          if (f.type) {
            typeMap.set(f.name, f.type);
          }
        }
        queryFieldTypesMap.set(queryReq.name, typeMap);
      }
    }

    // Emit skip-with-warning for queries that were declared but have no field metadata
    for (const queryReq of componentSpec.dataRequirements.queries) {
      if (!queryFieldsMap.has(queryReq.name)) {
        violations.push(
          createViolation(
            'query-result-field-access-validation',
            'low',
            null,
            `Unable to validate field access on query '${queryReq.name}' results — query field metadata not available. Add fields to dataRequirements.queries for accurate validation.`,
            queryReq.name
          )
        );
      }
    }

    // If we couldn't load any query field metadata, skip further validation
    if (queryFieldsMap.size === 0) {
      return violations;
    }

    // Track RunQuery result variables: varName -> queryName
    const runQueryResultVars = new Map<string, string>();
    // Track .Results arrays: varName -> queryName
    const queryArrayVars = new Map<string, string>();

    /**
     * Validates a single field access on a query row variable.
     */
    function validateFieldAccess(
      node: t.MemberExpression | t.OptionalMemberExpression,
      paramName: string,
      queryName: string
    ): void {
      const access = resolveMemberAccess(node);
      if (!access || access.objectName !== paramName) return;

      const { propertyName } = access;
      const validFields = queryFieldsMap.get(queryName);
      if (!validFields) return;

      // Field exists — no violation
      if (validFields.has(propertyName)) return;

      // Check for case mismatch first (medium severity)
      const caseFix = findCaseMismatch(propertyName, validFields);
      if (caseFix) {
        violations.push(
          createViolation(
            'query-result-field-access-validation',
            'medium',
            node,
            `Field "${propertyName}" on query "${queryName}" has incorrect casing. Did you mean "${caseFix}"?`,
            `${paramName}.${propertyName}`,
            {
              text: `Use the correct casing: "${caseFix}".`,
              example: `// Change:\n${paramName}.${propertyName}\n// To:\n${paramName}.${caseFix}`,
            }
          )
        );
        return;
      }

      // Check for close typo via Levenshtein (high severity)
      const closest = findClosestMatch(propertyName, validFields);
      const availableFields = Array.from(validFields).slice(0, 10);
      const moreText = validFields.size > 10 ? ` and ${validFields.size - 10} more` : '';

      if (closest) {
        violations.push(
          createViolation(
            'query-result-field-access-validation',
            'high',
            node,
            `Field "${propertyName}" does not exist on query "${queryName}". Did you mean "${closest}"? Available fields: ${availableFields.join(', ')}${moreText}`,
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
            'query-result-field-access-validation',
            'high',
            node,
            `Field "${propertyName}" does not exist on query "${queryName}". Available fields: ${availableFields.join(', ')}${moreText}`,
            `${paramName}.${propertyName}`,
            {
              text: `Use one of the valid fields from the "${queryName}" query.`,
            }
          )
        );
      }
    }

    /**
     * Checks for numeric coercion on GUID fields from query results.
     */
    function checkTypeCoercion(
      callNode: t.CallExpression,
      queryRowParams: Map<string, string>
    ): void {
      if (!t.isIdentifier(callNode.callee)) return;
      if (!NUMERIC_COERCION_FUNCTIONS.has(callNode.callee.name)) return;
      if (callNode.arguments.length === 0) return;

      const arg = callNode.arguments[0];
      if (!t.isMemberExpression(arg) && !t.isOptionalMemberExpression(arg)) return;

      const access = resolveMemberAccess(arg);
      if (!access) return;

      const queryName = queryRowParams.get(access.objectName);
      if (!queryName) return;

      const typeMap = queryFieldTypesMap.get(queryName);
      const sqlType = typeMap?.get(access.propertyName);

      if (typeof sqlType === 'string' && sqlType.toLowerCase() === 'uniqueidentifier') {
        violations.push(
          createViolation(
            'query-result-field-access-validation',
            'medium',
            callNode,
            `${callNode.callee.name}(${access.objectName}.${access.propertyName}) coerces a uniqueidentifier (GUID) to a number. GUIDs are strings, not numeric values.`,
            truncateCode(`${callNode.callee.name}(${access.objectName}.${access.propertyName})`),
            {
              text: `"${access.propertyName}" is a uniqueidentifier field. Use it as a string directly.`,
              example: `// Instead of:\n${callNode.callee.name}(${access.objectName}.${access.propertyName})\n// Use:\n${access.objectName}.${access.propertyName}  // Already a string`,
            }
          )
        );
      }
    }

    /**
     * Walks a callback body, validating all field accesses on known query row params.
     */
    function validateCallbackBody(
      body: t.Node,
      paramNames: string[],
      queryName: string
    ): void {
      const queryRowParams = new Map<string, string>();
      for (const p of paramNames) {
        queryRowParams.set(p, queryName);
      }

      traverse(body, {
        MemberExpression(innerPath: NodePath<t.MemberExpression>) {
          const objName = t.isIdentifier(innerPath.node.object) ? innerPath.node.object.name : null;
          if (objName && queryRowParams.has(objName)) {
            validateFieldAccess(innerPath.node, objName, queryName);
          }
        },
        OptionalMemberExpression(innerPath: NodePath<t.OptionalMemberExpression>) {
          const objName = t.isIdentifier(innerPath.node.object) ? innerPath.node.object.name : null;
          if (objName && queryRowParams.has(objName)) {
            validateFieldAccess(innerPath.node, objName, queryName);
          }
        },
        CallExpression(innerPath: NodePath<t.CallExpression>) {
          checkTypeCoercion(innerPath.node, queryRowParams);
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

        // Detect: const result = await utilities.rq.RunQuery({ QueryName: '...' })
        if (t.isAwaitExpression(init) && t.isCallExpression(init.argument)) {
          const call = init.argument;
          if (
            t.isMemberExpression(call.callee) &&
            t.isMemberExpression(call.callee.object) &&
            t.isIdentifier(call.callee.property) &&
            call.callee.property.name === 'RunQuery'
          ) {
            if (call.arguments.length > 0 && t.isObjectExpression(call.arguments[0])) {
              for (const prop of call.arguments[0].properties) {
                if (
                  t.isObjectProperty(prop) &&
                  t.isIdentifier(prop.key) &&
                  prop.key.name === 'QueryName' &&
                  t.isStringLiteral(prop.value)
                ) {
                  runQueryResultVars.set(varName, prop.value.value);
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
            const queryName = runQueryResultVars.get(sourceVar);
            if (queryName) {
              queryArrayVars.set(varName, queryName);
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

        let queryName: string | undefined;

        // .map() etc. on a tracked array variable
        if (t.isIdentifier(callee.object)) {
          queryName = queryArrayVars.get(callee.object.name);
        }

        // .Results.map() — direct chaining on result.Results or result?.Results
        if (
          (t.isMemberExpression(callee.object) || t.isOptionalMemberExpression(callee.object)) &&
          t.isIdentifier(callee.object.object) &&
          t.isIdentifier(callee.object.property) &&
          callee.object.property.name === 'Results'
        ) {
          queryName = runQueryResultVars.get(callee.object.object.name);
        }

        if (!queryName) return;
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

        validateCallbackBody(callback.body, paramNames, queryName);
      },
    });

    return violations;
    }
}
