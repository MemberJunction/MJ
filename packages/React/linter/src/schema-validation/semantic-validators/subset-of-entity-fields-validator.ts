/**
 * Subset Of Entity Fields Validator
 *
 * Validates that array elements are valid field names for a specified entity.
 *
 * This validator is essential for catching errors like:
 * ```jsx
 * // ❌ BROKEN - FullName, Status, StartDate don't exist on Members
 * <EntityDataGrid
 *   entityName="Members"
 *   fields={['FullName', 'Status', 'StartDate']}
 * />
 *
 * // ✅ FIXED - FirstName, LastName, Email exist on Members
 * <EntityDataGrid
 *   entityName="Members"
 *   fields={['FirstName', 'LastName', 'Email']}
 * />
 * ```
 *
 * Constraint Definition:
 * ```json
 * {
 *   "type": "subset-of-entity-fields",
 *   "dependsOn": "entityName",
 *   "config": {
 *     "allowWildcard": false,
 *     "caseSensitive": false
 *   }
 * }
 * ```
 */

import {
  PropertyConstraint,
  ConstraintViolation,
} from '@memberjunction/interactive-component-types';
import { RegisterClass } from '@memberjunction/global';
import { SemanticValidator } from './semantic-validator';
import { ValidationContext } from './validation-context';
import { PropValueExtractor } from '../../prop-value-extractor';

/**
 * Validates that array elements are valid field names for an entity
 *
 * **Depends On**: Entity name (from entityName prop)
 * **Validates**: Array of field name strings
 * **Common Use Cases**:
 * - EntityDataGrid fields prop
 * - DataGrid columns (when using entity binding)
 * - Custom components with entity field arrays
 */
@RegisterClass(SemanticValidator, 'subset-of-entity-fields')
export class SubsetOfEntityFieldsValidator extends SemanticValidator {
  /**
   * Validate that array elements are valid entity field names
   *
   * @param context - Validation context
   * @param constraint - Constraint definition
   * @returns Array of violations (empty if valid)
   */
  validate(
    context: ValidationContext,
    constraint: PropertyConstraint
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Check if value is dynamic (can't validate statically)
    if (this.isDynamicValue(context.propertyValue)) {
      return violations; // Skip validation
    }

    // Get the entity name from dependent prop
    const entityName = this.getDependentPropValue(context, constraint);

    if (!entityName || typeof entityName !== 'string') {
      // Can't validate without entity name
      return violations;
    }

    // Check if entity exists
    if (!context.hasEntity(entityName)) {
      // Entity doesn't exist - not this validator's responsibility to report
      // (should be caught by valid-entity-reference validator)
      return violations;
    }

    // Get entity fields
    const entityFields = context.getEntityFields(entityName);
    const fieldNames = entityFields.map((f) => f.name);
    const fieldNamesLower = fieldNames.map((f) => f.toLowerCase());

    // Extract config
    const config = constraint.config || {};
    const allowWildcard = config.allowWildcard === true;
    const caseSensitive = config.caseSensitive === true;

    // Validate the property value is an array
    if (!Array.isArray(context.propertyValue)) {
      violations.push(
        this.createViolation(
          'invalid-type',
          this.applyErrorTemplate(
            constraint,
            context,
            `Property '${context.propertyName}' must be an array of field names`,
            { entityName }
          ),
          'critical',
          `Use an array: ${context.propertyName}={['${fieldNames.slice(0, 3).join("', '")}']}`
        )
      );
      return violations;
    }

    // Validate each element is a string or object with 'field' property
    for (let i = 0; i < context.propertyValue.length; i++) {
      const element = context.propertyValue[i];

      // Skip dynamic values (identifiers, expressions)
      if (this.isDynamicValue(element)) {
        continue;
      }

      // Extract field name from element
      let fieldName: string | null = null;

      if (typeof element === 'string') {
        // Simple string field name
        fieldName = element;
      } else if (typeof element === 'object' && element !== null) {
        // Object with 'field' property (e.g., ColumnDef, FieldDefinition)
        const fieldProp = (element as any).field;
        if (typeof fieldProp === 'string') {
          fieldName = fieldProp;
        } else if (this.isDynamicValue(fieldProp)) {
          // Dynamic field property - skip validation
          continue;
        } else {
          // Object without valid 'field' property
          violations.push(
            this.createViolation(
              'invalid-element-type',
              this.applyErrorTemplate(
                constraint,
                context,
                `Element at index ${i} in '${context.propertyName}' must be a string or object with 'field' property`,
                { entityName, index: i, elementType: typeof element }
              ),
              'high',
              `Use string field names or objects with 'field' property from entity '${entityName}'`
            )
          );
          continue;
        }
      } else {
        // Invalid type (not string or object)
        violations.push(
          this.createViolation(
            'invalid-element-type',
            this.applyErrorTemplate(
              constraint,
              context,
              `Element at index ${i} in '${context.propertyName}' must be a string or object, got ${typeof element}`,
              { entityName, index: i, elementType: typeof element }
            ),
            'high',
            `Use string field names from entity '${entityName}'`
          )
        );
        continue;
      }

      // At this point, fieldName should be a string
      if (!fieldName) {
        continue; // Should not reach here, but safety check
      }

      // Check for wildcard
      if (allowWildcard && fieldName === '*') {
        continue; // Wildcard is allowed
      }

      // Check if field exists
      let fieldExists = false;
      let correctCaseName: string | null = null;

      if (caseSensitive) {
        fieldExists = fieldNames.includes(fieldName);
      } else {
        // Case-insensitive check
        const index = fieldNamesLower.indexOf(fieldName.toLowerCase());
        fieldExists = index !== -1;
        if (fieldExists) {
          correctCaseName = fieldNames[index];
        }
      }

      if (!fieldExists) {
        // Field doesn't exist - find similar fields for suggestion
        const similarFields = this.findSimilar(fieldName, fieldNames, 3, 3);
        let suggestion = '';

        if (similarFields.length > 0) {
          suggestion = `Did you mean: ${this.formatValueList(similarFields, 3)}?`;
        } else {
          suggestion = `Available fields: ${this.formatValueList(fieldNames, 10)}`;
        }

        violations.push(
          this.createViolation(
            'invalid-field',
            this.applyErrorTemplate(
              constraint,
              context,
              `Field '${fieldName}' does not exist on entity '${entityName}'`,
              {
                field: fieldName,
                entityName,
                availableFields: fieldNames.slice(0, 10).join(', '),
              }
            ),
            'critical',
            suggestion,
            {
              field: fieldName,
              entityName,
              index: i,
              availableFields: fieldNames,
              similarFields,
            }
          )
        );
      } else if (!caseSensitive && correctCaseName && correctCaseName !== fieldName) {
        // Field exists but case doesn't match
        violations.push(
          this.createViolation(
            'case-mismatch',
            this.applyErrorTemplate(
              constraint,
              context,
              `Field '${fieldName}' case doesn't match schema. Expected '${correctCaseName}' on entity '${entityName}'`,
              {
                field: fieldName,
                correctCase: correctCaseName,
                entityName,
              }
            ),
            'medium',
            `Use '${correctCaseName}' instead of '${fieldName}'`,
            {
              field: fieldName,
              correctCase: correctCaseName,
              entityName,
              index: i,
            }
          )
        );
      }
    }

    return violations;
  }

  /**
   * Get validator description
   */
  getDescription(): string {
    return 'Validates that array elements are valid field names for the specified entity';
  }
}
