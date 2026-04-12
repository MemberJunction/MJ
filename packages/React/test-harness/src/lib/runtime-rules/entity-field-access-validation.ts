import traverse, { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { LintRule } from '../lint-rule';
import { RuleRegistry } from '../rule-registry';
import { Violation } from '../component-linter';
import { TypeContext, FieldTypeInfo } from '../type-context';
import { createViolation, truncateCode } from '../lint-utils';

/**
 * Rule: entity-field-access-validation
 *
 * Validates field access on entity row variables using the shared TypeContext.
 * The TypeInferenceEngine populates variable types (including callback parameters
 * in .map/.filter/.reduce), so this rule simply checks every MemberExpression
 * whose object is typed as 'entity-row' and validates the property name.
 *
 * Catches:
 * - Nonexistent fields (high severity, with closest-match suggestion)
 * - Field name typos via Levenshtein distance (high severity)
 * - Case mismatches like `m.email` vs `m.Email` (medium severity)
 * - Type coercion on GUID fields like `parseInt(m.ID)` (medium severity)
 * - Optional chaining expressions like `m?.FieldName`
 *
 * Severity: high (nonexistent/typo), medium (case mismatch, type coercion)
 * Applies to: all components
 */

function levenshteinDistance(a: string, b: string): number {
  if (typeof a !== 'string' || typeof b !== 'string') return Infinity;
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function findClosestField(fieldName: string, validFields: string[]): string | null {
  let bestMatch: string | null = null;
  let bestDist = Infinity;
  for (const valid of validFields) {
    const dist = levenshteinDistance(fieldName.toLowerCase(), valid.toLowerCase());
    if (dist < bestDist) { bestDist = dist; bestMatch = valid; }
  }
  const maxAllowed = Math.max(3, Math.floor(fieldName.length * 0.5));
  return bestMatch && bestDist > 0 && bestDist <= maxAllowed ? bestMatch : null;
}

function findCaseMismatch(fieldName: string, validFields: string[]): string | null {
  for (const valid of validFields) {
    if (typeof valid === 'string' && valid.toLowerCase() === fieldName.toLowerCase() && valid !== fieldName) return valid;
  }
  return null;
}

const NUMERIC_COERCION_FUNCTIONS = new Set(['parseInt', 'parseFloat', 'Number']);

/** Common DOM/React/JS properties that should never be validated as entity fields */
const NON_ENTITY_PROPERTIES = new Set([
  // DOM event properties
  'target', 'currentTarget', 'preventDefault', 'stopPropagation', 'nativeEvent',
  'type', 'bubbles', 'cancelable', 'defaultPrevented', 'eventPhase', 'isTrusted',
  // DOM element properties
  'value', 'checked', 'selectedIndex', 'innerHTML', 'textContent', 'className',
  'style', 'classList', 'dataset', 'children', 'parentNode', 'parentElement',
  'offsetWidth', 'offsetHeight', 'scrollTop', 'scrollLeft', 'clientWidth', 'clientHeight',
  // React/JS common
  'current', 'then', 'catch', 'finally', 'prototype', 'constructor', 'length',
  'map', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'includes',
  'push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat', 'join',
  'keys', 'values', 'entries', 'toString', 'valueOf', 'hasOwnProperty',
]);

/**
 * Resolves the variable name from a MemberExpression or OptionalMemberExpression.
 * Handles scoped names by checking if any scope prefix matches.
 */
function resolveVariableType(
  objectNode: t.Node,
  typeContext: TypeContext,
  path: NodePath
): { entityName: string; queryName?: string; fields: Map<string, FieldTypeInfo> } | null {
  if (!t.isIdentifier(objectNode)) return null;

  const varName = objectNode.name;

  // Try direct lookup first, then scoped lookup
  let varType = typeContext.getVariableType(varName);

  if (!varType || varType.type === 'unknown') {
    // Try with scope prefix from the path
    let current: NodePath | null = path;
    while (current) {
      if (current.isFunction()) {
        let fnName: string | undefined;
        const node = current.node;
        if (t.isFunctionDeclaration(node) && node.id) {
          fnName = node.id.name;
        } else if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
          const parent = current.parent;
          if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) {
            fnName = parent.id.name;
          }
        }
        if (fnName) {
          varType = typeContext.getVariableType(`${fnName}:${varName}`);
          if (varType && varType.type !== 'unknown') break;
        }
      }
      current = current.parentPath;
    }
  }

  if (!varType) return null;

  if (varType.type === 'entity-row' && varType.entityName && varType.fields) {
    return { entityName: varType.entityName, fields: varType.fields };
  }
  if (varType.type === 'query-row' && varType.queryName && varType.fields) {
    return { queryName: varType.queryName, entityName: varType.queryName, fields: varType.fields };
  }

  return null;
}

export const entityFieldAccessValidationRule: LintRule = {
  name: 'entity-field-access-validation',
  appliesTo: 'all',
  test: (ast, _componentName, componentSpec, _options, sharedTypeContext) => {
    const violations: Violation[] = [];

    // Use shared TypeContext if available, otherwise create own (backward compat)
    const typeContext = sharedTypeContext ?? new TypeContext(componentSpec);

    // Pre-load entity field sets for validation.
    // Sources: 1) componentSpec.dataRequirements.entities, 2) entity names discovered
    // by the TypeInferenceEngine from RunView({ EntityName: '...' }) calls in code.
    const entityFieldSets = new Map<string, string[]>();

    function ensureEntityFields(entityName: string): void {
      if (entityFieldSets.has(entityName)) return;
      const fields = typeContext.getEntityFieldTypesSync(entityName);
      if (fields.size > 0) {
        entityFieldSets.set(entityName, Array.from(fields.keys()));
      }
    }

    // Load from spec if available
    if (componentSpec?.dataRequirements?.entities) {
      for (const entityReq of componentSpec.dataRequirements.entities) {
        ensureEntityFields(entityReq.name);
        if (!entityFieldSets.has(entityReq.name) && entityReq.fieldMetadata?.length) {
          entityFieldSets.set(entityReq.name, entityReq.fieldMetadata.map(f => f.name));
        }
      }
    }

    // Also discover entity names from RunView calls in the AST
    // (handles fixtures that don't have dataRequirements but do call RunView)
    traverse(ast, {
      CallExpression(p: NodePath<t.CallExpression>) {
        const callee = p.node.callee;
        if (t.isMemberExpression(callee) && t.isIdentifier(callee.property) && callee.property.name === 'RunView') {
          if (p.node.arguments.length > 0 && t.isObjectExpression(p.node.arguments[0])) {
            for (const prop of p.node.arguments[0].properties) {
              if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'EntityName' && t.isStringLiteral(prop.value)) {
                ensureEntityFields(prop.value.value);
              }
            }
          }
        }
      },
      noScope: true,
    } as Parameters<typeof traverse>[1]);

    if (entityFieldSets.size === 0) return violations;

    function validateFieldAccess(
      node: t.MemberExpression | t.OptionalMemberExpression,
      entityName: string,
      validFields: string[],
      objectName: string,
      propertyName: string
    ): void {
      if (validFields.includes(propertyName)) return;

      // Skip common DOM/React/JS properties — these are never entity fields
      // and would indicate a scope mismatch (variable shadowed by a different context)
      if (NON_ENTITY_PROPERTIES.has(propertyName)) return;

      const caseFix = findCaseMismatch(propertyName, validFields);
      if (caseFix) {
        violations.push(createViolation(
          'entity-field-access-validation', 'medium', node,
          `Field "${propertyName}" on entity "${entityName}" has incorrect casing. Did you mean "${caseFix}"?`,
          `${objectName}.${propertyName}`,
          { text: `Use the correct casing: "${caseFix}". MemberJunction entity fields use PascalCase.`,
            example: `// Change:\n${objectName}.${propertyName}\n// To:\n${objectName}.${caseFix}` }
        ));
        return;
      }

      const closest = findClosestField(propertyName, validFields);
      const preview = validFields.slice(0, 10).join(', ');
      const more = validFields.length > 10 ? ` and ${validFields.length - 10} more` : '';

      violations.push(createViolation(
        'entity-field-access-validation', 'high', node,
        closest
          ? `Field "${propertyName}" does not exist on entity "${entityName}". Did you mean "${closest}"? Available fields: ${preview}${more}`
          : `Field "${propertyName}" does not exist on entity "${entityName}". Available fields: ${preview}${more}`,
        `${objectName}.${propertyName}`,
        closest
          ? { text: `Replace "${propertyName}" with "${closest}".`, example: `${objectName}.${closest}` }
          : { text: `Use one of the valid fields from the "${entityName}" entity.` }
      ));
    }

    // Traverse all member expressions and check entity-row typed variables
    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (path.node.computed || !t.isIdentifier(path.node.property)) return;
        const propertyName = path.node.property.name;

        const resolved = resolveVariableType(path.node.object, typeContext, path);
        if (!resolved) return;

        const validFields = entityFieldSets.get(resolved.entityName);
        if (!validFields) return;

        const objectName = t.isIdentifier(path.node.object) ? path.node.object.name : '(expr)';
        validateFieldAccess(path.node, resolved.entityName, validFields, objectName, propertyName);
      },

      OptionalMemberExpression(path: NodePath<t.OptionalMemberExpression>) {
        if (path.node.computed || !t.isIdentifier(path.node.property)) return;
        const propertyName = path.node.property.name;

        const resolved = resolveVariableType(path.node.object, typeContext, path);
        if (!resolved) return;

        const validFields = entityFieldSets.get(resolved.entityName);
        if (!validFields) return;

        const objectName = t.isIdentifier(path.node.object) ? path.node.object.name : '(expr)';
        validateFieldAccess(path.node, resolved.entityName, validFields, objectName, propertyName);
      },

      // Check for numeric coercion on GUID fields
      CallExpression(path: NodePath<t.CallExpression>) {
        if (!t.isIdentifier(path.node.callee) || !NUMERIC_COERCION_FUNCTIONS.has(path.node.callee.name)) return;
        if (path.node.arguments.length === 0) return;

        const arg = path.node.arguments[0];
        if (!t.isMemberExpression(arg) && !t.isOptionalMemberExpression(arg)) return;
        if (arg.computed || !t.isIdentifier(arg.property) || !t.isIdentifier(arg.object)) return;

        const resolved = resolveVariableType(arg.object, typeContext, path);
        if (!resolved) return;

        const fieldInfo = resolved.fields.get(arg.property.name);
        if (fieldInfo?.sqlType?.toLowerCase() === 'uniqueidentifier') {
          violations.push(createViolation(
            'entity-field-access-validation', 'medium', path.node,
            `${path.node.callee.name}(${arg.object.name}.${arg.property.name}) coerces a uniqueidentifier (GUID) to a number. GUIDs are strings, not numeric values.`,
            truncateCode(`${path.node.callee.name}(${arg.object.name}.${arg.property.name})`),
            { text: `"${arg.property.name}" is a uniqueidentifier field. Use it as a string directly.`,
              example: `${arg.object.name}.${arg.property.name}  // Already a string` }
          ));
        }
      },
    });

    return violations;
  },
};

// Self-register when this module is imported
RuleRegistry.getInstance().registerRuntimeRule(entityFieldAccessValidationRule);
