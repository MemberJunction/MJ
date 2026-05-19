import { traverse, NodePath, createViolation, truncateCode, findClosestMatch, findCaseMismatch, NUMERIC_COERCION_FUNCTIONS, NON_ENTITY_PROPERTIES } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentExecutionOptions } from '../component-runner';
import { TypeContext, FieldTypeInfo } from '../type-context';

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


/**
 * Looks up a variable's TypeInfo from the TypeContext, including scoped lookups.
 */
function lookupVariableTypeInfo(
  varName: string,
  typeContext: TypeContext,
  path: NodePath
): { type: string; entityName?: string; queryName?: string; fields?: Map<string, FieldTypeInfo>; arrayElementType?: { type: string; entityName?: string; queryName?: string; fields?: Map<string, FieldTypeInfo> } } | null {
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

  return varType ?? null;
}

/**
 * Resolves the variable name from a MemberExpression or OptionalMemberExpression.
 * Handles:
 * - Simple identifiers: `variable.Field`
 * - Scoped names: callback params in `.map()`, etc.
 * - Inline indexed access: `result.Results?.[0]?.Field` where [0] yields an entity/query row
 */
function resolveVariableType(
  objectNode: t.Node,
  typeContext: TypeContext,
  path: NodePath
): { entityName: string; queryName?: string; fields: Map<string, FieldTypeInfo> } | null {
  // Case 1: Simple identifier — `variable.Field`
  if (t.isIdentifier(objectNode)) {
    const varType = lookupVariableTypeInfo(objectNode.name, typeContext, path);
    if (!varType) return null;

    if (varType.type === 'entity-row' && varType.entityName) {
      let fields = varType.fields;
      // If fields are missing (DB unavailable during type inference), try to
      // load from TypeContext cache or spec fieldMetadata
      if (!fields || fields.size === 0) {
        fields = typeContext.getEntityFieldTypesSync(varType.entityName);
      }
      if (fields && fields.size > 0) {
        return { entityName: varType.entityName, fields };
      }
      // Fields still empty — will be handled by the fieldMetadata fallback in the main rule logic
      return null;
    }
    if (varType.type === 'query-row' && varType.queryName) {
      let fields = varType.fields;
      if (!fields || fields.size === 0) {
        fields = typeContext.getQueryFieldTypes(varType.queryName) ?? undefined;
      }
      if (fields && fields.size > 0) {
        return { queryName: varType.queryName, entityName: varType.queryName, fields };
      }
      return null;
    }
    return null;
  }

  // Case 2: Indexed access on .Results — `result.Results?.[0]?.Field` or `result.Results[0].Field`
  // The object is a computed member/optional-member expression like `result.Results?.[0]`
  if ((t.isMemberExpression(objectNode) || t.isOptionalMemberExpression(objectNode)) && objectNode.computed) {
    const arrayExpr = objectNode.object;
    // arrayExpr should be `result.Results` or `result.Results?`
    if ((t.isMemberExpression(arrayExpr) || t.isOptionalMemberExpression(arrayExpr)) &&
        t.isIdentifier(arrayExpr.property) && arrayExpr.property.name === 'Results' &&
        t.isIdentifier(arrayExpr.object)) {
      const resultVarType = lookupVariableTypeInfo(arrayExpr.object.name, typeContext, path);
      if (resultVarType?.type === 'object') {
        // The .Results array's element type carries the entity/query row info
        if (resultVarType.entityName) {
          const entityFields = typeContext.getEntityFieldTypesSync(resultVarType.entityName);
          if (entityFields.size > 0) {
            return { entityName: resultVarType.entityName, fields: entityFields };
          }
        }
        if (resultVarType.queryName) {
          const queryFields = typeContext.getQueryFieldTypes(resultVarType.queryName);
          if (queryFields && queryFields.size > 0) {
            return { queryName: resultVarType.queryName, entityName: resultVarType.queryName, fields: queryFields };
          }
        }
      }
    }
  }

  return null;
}

@RegisterClass(BaseLintRule, 'entity-field-access-validation')
export class EntityFieldAccessValidationRule extends BaseLintRule {
  get Name() { return 'entity-field-access-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec, _options?: ComponentExecutionOptions, sharedTypeContext?: TypeContext): Violation[] {
    const violations: Violation[] = [];

    // Use shared TypeContext if available, otherwise create own (backward compat)
    const typeContext = sharedTypeContext ?? new TypeContext(componentSpec);

    // Pre-load entity field sets for validation.
    // Sources: 1) componentSpec.dataRequirements.entities, 2) entity names discovered
    // by the TypeInferenceEngine from RunView({ EntityName: '...' }) calls in code.
    const entityFieldSets = new Map<string, string[]>();
    // Track entity names discovered in RunView calls for skip-with-warning
    const discoveredEntityNames = new Set<string>();

    function ensureEntityFields(entityName: string): void {
      if (entityFieldSets.has(entityName)) return;
      const fields = typeContext.getEntityFieldTypesSync(entityName);
      if (fields.size > 0) {
        entityFieldSets.set(entityName, Array.from(fields.keys()));
      }
    }

    // Check if spec has fieldMetadata for a given entity
    function specHasFieldMetadata(entityName: string): boolean {
      if (!componentSpec?.dataRequirements?.entities) return false;
      return componentSpec.dataRequirements.entities.some(
        e => e.name === entityName && e.fieldMetadata && e.fieldMetadata.length > 0
      );
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
                discoveredEntityNames.add(prop.value.value);
                ensureEntityFields(prop.value.value);
              }
            }
          }
        }
      },
      noScope: true,
    } as Parameters<typeof traverse>[1]);

    // Emit skip-with-warning for entities discovered in RunView calls but lacking metadata
    for (const entityName of discoveredEntityNames) {
      if (!entityFieldSets.has(entityName) && !specHasFieldMetadata(entityName)) {
        violations.push(createViolation(
          'entity-field-access-validation', 'low', null,
          `Unable to validate field access on entity '${entityName}' — entity metadata not available. Ensure database connection or add fieldMetadata to dataRequirements for accurate validation.`,
          entityName
        ));
      }
    }

    // Skip traversal only if there are no entity fields loaded AND no query fields
    // in the spec that could be resolved through inline expression type resolution
    const hasQueryFields = componentSpec?.dataRequirements?.queries?.some(
      q => (q.fields && q.fields.length > 0)
    ) ?? false;
    if (entityFieldSets.size === 0 && !hasQueryFields) return violations;

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

      const closest = findClosestMatch(propertyName, validFields);
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

    /**
     * Gets the valid fields for a resolved entity/query, populating entityFieldSets
     * on-demand from resolved.fields when not already loaded (e.g., for query-row types
     * discovered via inline expressions).
     */
    function getValidFields(resolved: { entityName: string; fields: Map<string, FieldTypeInfo> }): string[] | undefined {
      let validFields = entityFieldSets.get(resolved.entityName);
      if (!validFields && resolved.fields.size > 0) {
        const fieldNames = Array.from(resolved.fields.keys());
        entityFieldSets.set(resolved.entityName, fieldNames);
        validFields = fieldNames;
      }
      return validFields;
    }

    // Traverse all member expressions and check entity-row typed variables
    traverse(ast, {
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (path.node.computed || !t.isIdentifier(path.node.property)) return;
        const propertyName = path.node.property.name;

        let resolved = resolveVariableType(path.node.object, typeContext, path);
        // Fallback: if we have an entity-row variable but resolveVariableType returned null
        // (fields unavailable from DB), try to get fields from entityFieldSets (populated from spec fieldMetadata)
        if (!resolved && t.isIdentifier(path.node.object)) {
          const varType = lookupVariableTypeInfo(path.node.object.name, typeContext, path);
          if (varType?.type === 'entity-row' && varType.entityName && entityFieldSets.has(varType.entityName)) {
            const fieldNames = entityFieldSets.get(varType.entityName)!;
            const fields = new Map(fieldNames.map(n => [n, { type: 'string', fromMetadata: false } as FieldTypeInfo]));
            resolved = { entityName: varType.entityName, fields };
          }
        }
        if (!resolved) return;

        const validFields = getValidFields(resolved);
        if (!validFields) return;

        const objectName = t.isIdentifier(path.node.object) ? path.node.object.name : '(expr)';
        validateFieldAccess(path.node, resolved.entityName, validFields, objectName, propertyName);
      },

      OptionalMemberExpression(path: NodePath<t.OptionalMemberExpression>) {
        if (path.node.computed || !t.isIdentifier(path.node.property)) return;
        const propertyName = path.node.property.name;

        let resolved = resolveVariableType(path.node.object, typeContext, path);
        // Same fallback for optional chaining
        if (!resolved && t.isIdentifier(path.node.object)) {
          const varType = lookupVariableTypeInfo(path.node.object.name, typeContext, path);
          if (varType?.type === 'entity-row' && varType.entityName && entityFieldSets.has(varType.entityName)) {
            const fieldNames = entityFieldSets.get(varType.entityName)!;
            const fields = new Map(fieldNames.map(n => [n, { type: 'string', fromMetadata: false } as FieldTypeInfo]));
            resolved = { entityName: varType.entityName, fields };
          }
        }
        if (!resolved) return;

        const validFields = getValidFields(resolved);
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
  }
}
