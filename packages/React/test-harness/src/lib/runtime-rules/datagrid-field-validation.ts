import { traverse, NodePath } from '../lint-utils';
import * as t from '@babel/types';
import { RegisterClass } from '@memberjunction/global';
import { BaseLintRule } from '../lint-rule';
import { Violation } from '../component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { TypeContext } from '../type-context';

/**
 * Rule: datagrid-field-validation
 *
 * Validates DataGrid/EntityGrid column field references against entity/query metadata.
 * Detects nonexistent field names in `fields` arrays and `columns` config objects,
 * as well as case mismatches that indicate likely typos.
 *
 * Severity: high for nonexistent fields, medium for case mismatches
 * Applies to: all components
 */

/** Grid component names to check */
const GRID_COMPONENT_NAMES = new Set([
  'EntityGrid', 'EntityDataGrid', 'DataGrid', 'DataTable', 'SingleRecordView',
]);

/** Grid components that are inherently entity-bound (always validate) */
const ENTITY_BOUND_GRIDS = new Set(['EntityGrid', 'EntityDataGrid']);

/**
 * Checks if a JSX element is a grid component by name or by having grid-related props.
 */
function isGridComponent(
  elementName: string,
  hasGridProps: boolean,
): boolean {
  if (GRID_COMPONENT_NAMES.has(elementName)) return true;
  return hasGridProps;
}

/**
 * Collects available field names from the component spec's data requirements.
 * Returns a map of lowercase field name to original field name for case-insensitive matching.
 * Also tracks whether entity fields were actually loaded (vs only query fields being available).
 */
function collectAvailableFields(
  typeContext: TypeContext,
  componentSpec: {
    dataRequirements?: {
      entities?: { name: string; fieldMetadata?: { name: string; type: string }[] }[];
      queries?: { name: string; categoryPath: string; fields?: { name: string; type: string }[] }[];
    };
  },
): { exactSet: Set<string>; caseMap: Map<string, string>; hasEntityFields: boolean; hasQueryFields: boolean } {
  const exactSet = new Set<string>();
  const caseMap = new Map<string, string>(); // lowercase -> original name
  let hasEntityFields = false;
  let hasQueryFields = false;

  if (componentSpec.dataRequirements?.entities) {
    for (const entity of componentSpec.dataRequirements.entities) {
      const entityFields = typeContext.getEntityFieldTypesSync(entity.name);
      for (const fieldName of entityFields.keys()) {
        if (typeof fieldName !== 'string') continue;
        exactSet.add(fieldName);
        caseMap.set(fieldName.toLowerCase(), fieldName);
        hasEntityFields = true;
      }
      if (entity.fieldMetadata) {
        for (const fm of entity.fieldMetadata) {
          if (typeof fm.name !== 'string') continue;
          exactSet.add(fm.name);
          caseMap.set(fm.name.toLowerCase(), fm.name);
          hasEntityFields = true;
        }
      }
    }
  }

  if (componentSpec.dataRequirements?.queries) {
    for (const query of componentSpec.dataRequirements.queries) {
      const queryFields = typeContext.getQueryFieldTypes(query.name, query.categoryPath);
      if (queryFields) {
        for (const fieldName of queryFields.keys()) {
          if (typeof fieldName !== 'string') continue;
          exactSet.add(fieldName);
          caseMap.set(fieldName.toLowerCase(), fieldName);
          hasQueryFields = true;
        }
      }
      if (query.fields) {
        for (const f of query.fields) {
          if (typeof f.name !== 'string') continue;
          exactSet.add(f.name);
          caseMap.set(f.name.toLowerCase(), f.name);
          hasQueryFields = true;
        }
      }
    }
  }

  return { exactSet, caseMap, hasEntityFields, hasQueryFields };
}

/**
 * Extracts string values from a JSX attribute that contains an array expression.
 * Handles patterns like fields={['Name', 'Email']}.
 */
function extractStringArrayFromAttr(attr: t.JSXAttribute): { value: string; loc: t.SourceLocation | null | undefined }[] {
  if (!t.isJSXExpressionContainer(attr.value)) return [];
  const expr = attr.value.expression;
  if (t.isJSXEmptyExpression(expr)) return [];
  if (!t.isArrayExpression(expr)) return [];

  const results: { value: string; loc: t.SourceLocation | null | undefined }[] = [];
  for (const el of expr.elements) {
    if (t.isStringLiteral(el)) {
      results.push({ value: el.value, loc: el.loc });
    }
  }
  return results;
}

/**
 * Extracts field names from a columns config array.
 * Handles patterns like columns={[{field: 'Name'}, {field: 'Email'}]}.
 */
function extractFieldsFromColumnsAttr(attr: t.JSXAttribute): { value: string; loc: t.SourceLocation | null | undefined }[] {
  if (!t.isJSXExpressionContainer(attr.value)) return [];
  const expr = attr.value.expression;
  if (t.isJSXEmptyExpression(expr)) return [];
  if (!t.isArrayExpression(expr)) return [];

  const results: { value: string; loc: t.SourceLocation | null | undefined }[] = [];
  for (const el of expr.elements) {
    if (!t.isObjectExpression(el)) continue;
    for (const prop of el.properties) {
      if (
        t.isObjectProperty(prop) &&
        t.isIdentifier(prop.key) &&
        prop.key.name === 'field' &&
        t.isStringLiteral(prop.value)
      ) {
        results.push({ value: prop.value.value, loc: prop.value.loc });
      }
    }
  }
  return results;
}

/**
 * Validates a list of field references against available fields.
 * Produces high severity for nonexistent fields and medium for case mismatches.
 */
function validateFieldReferences(
  fieldRefs: { value: string; loc: t.SourceLocation | null | undefined }[],
  exactSet: Set<string>,
  caseMap: Map<string, string>,
  propContext: string,
  violations: Violation[],
): void {
  for (const ref of fieldRefs) {
    if (typeof ref.value !== 'string') continue;
    if (exactSet.has(ref.value)) continue;

    const correctCase = caseMap.get(ref.value.toLowerCase());
    if (correctCase) {
      // Case mismatch
      violations.push({
        rule: 'datagrid-field-validation',
        severity: 'medium',
        line: ref.loc?.start.line ?? 0,
        column: ref.loc?.start.column ?? 0,
        message: `Field "${ref.value}" in ${propContext} has incorrect casing. Did you mean "${correctCase}"?`,
        code: `"${ref.value}"`,
        suggestion: {
          text: `Change "${ref.value}" to "${correctCase}"`,
          example: `"${correctCase}"`,
        },
      });
    } else {
      // Nonexistent field
      const available = Array.from(exactSet).slice(0, 10);
      const moreText = exactSet.size > 10
        ? ` and ${exactSet.size - 10} more`
        : '';

      violations.push({
        rule: 'datagrid-field-validation',
        severity: 'high',
        line: ref.loc?.start.line ?? 0,
        column: ref.loc?.start.column ?? 0,
        message: `Field "${ref.value}" in ${propContext} does not exist in the data source. Available fields: ${available.join(', ')}${moreText}`,
        code: `"${ref.value}"`,
        suggestion: {
          text: `Use one of the available fields: ${available.join(', ')}${moreText}`,
        },
      });
    }
  }
}

@RegisterClass(BaseLintRule, 'datagrid-field-validation')
export class DatagridFieldValidationRule extends BaseLintRule {
  get Name() { return 'datagrid-field-validation'; }
  get AppliesTo(): 'all' | 'child' | 'root' { return 'all'; }

  Test(ast: t.File, _componentName: string, componentSpec?: ComponentSpec): Violation[] {
    const violations: Violation[] = [];

    if (!componentSpec?.dataRequirements) {
      return violations;
    }

    const typeContext = new TypeContext(componentSpec);
    const { exactSet, caseMap, hasEntityFields, hasQueryFields } = collectAvailableFields(typeContext, componentSpec);

    if (exactSet.size === 0) {
      return violations;
    }

    traverse(ast, {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
        const nameNode = path.node.name;
        if (!t.isJSXIdentifier(nameNode)) return;

        // Collect props
        const propsMap = new Map<string, t.JSXAttribute>();
        for (const attr of path.node.attributes) {
          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
            propsMap.set(attr.name.name, attr);
          }
        }

        const hasGridProps = propsMap.has('fields') || propsMap.has('columns');
        if (!isGridComponent(nameNode.name, hasGridProps)) return;

        // Determine if this grid has a known schema to validate against:
        // 1. Entity-bound grids (EntityGrid, EntityDataGrid) — always validate against entity fields
        // 2. Any grid with an explicit entityName prop — schema is known
        // 3. Plain DataGrid fed by RunQuery results — query fields represent the actual
        //    data shape and can be validated
        //
        // For plain DataGrid/DataTable/SingleRecordView WITHOUT entityName and without
        // query fields, the data is likely from a client-side transformation
        // (renamed/computed fields). Validating against the raw entity schema would
        // produce false positives, so we skip.
        const isEntityBound = ENTITY_BOUND_GRIDS.has(nameNode.name) || propsMap.has('entityName');
        if (isEntityBound && !hasEntityFields) return; // Entity-bound but no metadata loaded
        if (!isEntityBound && !hasQueryFields) return; // Not entity-bound and no query fields — data is likely transformed

        // Validate `fields` prop: fields={['Name', 'Email']}
        const fieldsAttr = propsMap.get('fields');
        if (fieldsAttr) {
          const fieldRefs = extractStringArrayFromAttr(fieldsAttr);
          validateFieldReferences(fieldRefs, exactSet, caseMap, 'fields', violations);
        }

        // Validate `columns` prop: columns={[{field: 'Name'}, ...]}
        const columnsAttr = propsMap.get('columns');
        if (columnsAttr) {
          const fieldRefs = extractFieldsFromColumnsAttr(columnsAttr);
          validateFieldReferences(fieldRefs, exactSet, caseMap, 'columns', violations);
        }
      },
    });

    return violations;
  }
}
