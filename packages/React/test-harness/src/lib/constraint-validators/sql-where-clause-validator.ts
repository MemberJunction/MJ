/**
 * SQL WHERE Clause Validator
 *
 * Validates SQL WHERE clauses for syntax and field references.
 * Uses node-sql-parser for accurate AST-based validation with regex fallback.
 *
 * This validator is essential for catching errors like:
 * ```jsx
 * // ❌ BROKEN - LastModified doesn't exist on Products
 * <EntityDataGrid
 *   entityName="Products"
 *   extraFilter="Status='Active' AND LastModified > '2024-01-01'"
 * />
 *
 * // ✅ FIXED - CreatedAt exists on Products
 * <EntityDataGrid
 *   entityName="Products"
 *   extraFilter="Status='Active' AND CreatedAt > '2024-01-01'"
 * />
 * ```
 *
 * Validation Levels:
 * - **Level 1**: Field existence (IMPLEMENTED)
 * - **Level 2**: Type compatibility (FUTURE)
 * - **Level 3**: SQL function validation (FUTURE)
 *
 * Constraint Definition:
 * ```json
 * {
 *   "type": "sql-where-clause",
 *   "dependsOn": "entityName",
 *   "config": {
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
import { BaseConstraintValidator } from './base-constraint-validator';
import { ValidationContext } from './validation-context';
import { PropValueExtractor } from '../prop-value-extractor';
import NodeSqlParser from 'node-sql-parser';
const { Parser } = NodeSqlParser;

/**
 * Validates SQL WHERE clauses for syntax and field references
 *
 * **Depends On**: Entity name (from entityName prop)
 * **Validates**: SQL WHERE clause string
 * **Common Use Cases**:
 * - EntityDataGrid extraFilter prop
 * - RunView ExtraFilter parameter
 * - Custom components with SQL filtering
 *
 * **Implementation**: Uses node-sql-parser (same as QueryEntity.server.ts)
 * for accurate AST-based validation with regex fallback for edge cases.
 */
@RegisterClass(BaseConstraintValidator, 'sql-where-clause')
export class SqlWhereClauseValidator extends BaseConstraintValidator {
  /**
   * SQL keywords that are not field references
   * Used in regex fallback when AST parsing fails
   */
  private static readonly SQL_KEYWORDS = new Set([
    'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS', 'NULL',
    'TRUE', 'FALSE', 'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'EXISTS', 'ALL', 'ANY', 'SOME',
    // SQL Server functions - not field references
    'DATEADD', 'DATEDIFF', 'GETDATE', 'GETUTCDATE', 'SYSDATETIME',
    'CAST', 'CONVERT', 'ISNULL', 'COALESCE', 'NULLIF',
    'YEAR', 'MONTH', 'DAY', 'DATEPART', 'DATENAME',
    'LEN', 'SUBSTRING', 'CHARINDEX', 'PATINDEX', 'REPLACE',
    'UPPER', 'LOWER', 'TRIM', 'LTRIM', 'RTRIM',
    'LEFT', 'RIGHT', 'REVERSE', 'CONCAT', 'STRING_AGG',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
    'ROW_NUMBER', 'RANK', 'DENSE_RANK',
  ]);

  /**
   * Validate SQL WHERE clause
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

    // WHERE clause must be a string
    if (typeof context.propertyValue !== 'string') {
      return violations; // Not a string - not this validator's responsibility
    }

    const whereClause = context.propertyValue.trim();

    // Empty WHERE clause is valid
    if (whereClause.length === 0) {
      return violations;
    }

    // Get the entity name from dependent prop
    const entityName = this.getDependentPropValue(context, constraint);

    if (!entityName || typeof entityName !== 'string') {
      // Can't validate without entity name
      return violations;
    }

    // Check if entity exists
    if (!context.hasEntity(entityName)) {
      // Entity doesn't exist - not this validator's responsibility
      return violations;
    }

    // Get entity fields
    const entityFields = context.getEntityFields(entityName);
    const fieldNames = entityFields.map((f) => f.name);
    const fieldNamesLower = fieldNames.map((f) => f.toLowerCase());

    // Extract config
    const config = constraint.config || {};
    const caseSensitive = config.caseSensitive === true;

    // Try AST-based validation first (more accurate)
    try {
      const astViolations = this.validateWithAST(
        whereClause,
        entityName,
        fieldNames,
        fieldNamesLower,
        caseSensitive,
        context,
        constraint
      );
      violations.push(...astViolations);
    } catch (parseError: any) {
      // Fall back to regex if SQL parsing fails
      console.warn(`SQL parsing failed for WHERE clause, using regex fallback: ${parseError.message}`);

      const regexViolations = this.validateWithRegex(
        whereClause,
        entityName,
        fieldNames,
        fieldNamesLower,
        caseSensitive,
        context,
        constraint
      );
      violations.push(...regexViolations);
    }

    return violations;
  }

  /**
   * Validate WHERE clause using AST parsing (Level 1: Field existence)
   *
   * Uses node-sql-parser to accurately extract column references.
   * Pattern based on QueryEntity.server.ts (lines 305-324, 560-590)
   *
   * @param whereClause - SQL WHERE clause
   * @param entityName - Entity name for context
   * @param fieldNames - Valid field names
   * @param fieldNamesLower - Lowercase field names for case-insensitive matching
   * @param caseSensitive - Whether to check case sensitivity
   * @param context - Validation context
   * @param constraint - Constraint definition
   * @returns Array of violations
   */
  private validateWithAST(
    whereClause: string,
    entityName: string,
    fieldNames: string[],
    fieldNamesLower: string[],
    caseSensitive: boolean,
    context: ValidationContext,
    constraint: PropertyConstraint
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Parse WHERE clause using node-sql-parser
    // Same pattern as QueryEntity.server.ts line 309
    const parser = new Parser();
    const ast = parser.astify(`SELECT * FROM t WHERE ${whereClause}`, {
      database: 'TransactSQL',
    });

    // Extract column references from AST
    const columnRefs = new Set<string>();
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const statement of statements) {
      // Type guard: check if statement has a where clause
      if (statement && typeof statement === 'object' && 'where' in statement && statement.where) {
        this.extractColumnReferences(statement.where, columnRefs);
      }
    }

    // Validate each column reference
    for (const col of columnRefs) {
      // Handle qualified names (table.column) - extract just column name
      const colName = col.includes('.') ? col.split('.').pop()! : col;

      // Check if field exists
      let fieldExists = false;
      let correctCaseName: string | null = null;

      if (caseSensitive) {
        fieldExists = fieldNames.includes(colName);
      } else {
        // Case-insensitive check
        const index = fieldNamesLower.indexOf(colName.toLowerCase());
        fieldExists = index !== -1;
        if (fieldExists) {
          correctCaseName = fieldNames[index];
        }
      }

      if (!fieldExists) {
        // Field doesn't exist - find similar fields for suggestion
        const similarFields = this.findSimilar(colName, fieldNames, 3, 3);
        let suggestion = '';

        if (similarFields.length > 0) {
          suggestion = `Did you mean: ${this.formatValueList(similarFields, 3)}?`;
        } else {
          suggestion = `Available fields: ${this.formatValueList(fieldNames, 10)}`;
        }

        violations.push(
          this.createViolation(
            'invalid-field-reference',
            this.applyErrorTemplate(
              constraint,
              context,
              `SQL WHERE clause references invalid field '${colName}' on entity '${entityName}'`,
              {
                field: colName,
                entityName,
                availableFields: fieldNames.slice(0, 10).join(', '),
              }
            ),
            'critical',
            suggestion,
            {
              field: colName,
              entityName,
              availableFields: fieldNames,
              similarFields,
            }
          )
        );
      } else if (!caseSensitive && correctCaseName && correctCaseName !== colName) {
        // Field exists but case doesn't match
        violations.push(
          this.createViolation(
            'case-mismatch',
            this.applyErrorTemplate(
              constraint,
              context,
              `Field '${colName}' case doesn't match schema in WHERE clause. Expected '${correctCaseName}' on entity '${entityName}'`,
              {
                field: colName,
                correctCase: correctCaseName,
                entityName,
              }
            ),
            'medium',
            `Use '${correctCaseName}' instead of '${colName}'`,
            {
              field: colName,
              correctCase: correctCaseName,
              entityName,
            }
          )
        );
      }
    }

    return violations;
  }

  /**
   * Extract column references from SQL AST
   *
   * Pattern based on QueryEntity.extractColumnReferences (lines 563-590)
   * Recursively traverses the AST to find all column_ref nodes.
   *
   * @param expr - Expression node from AST
   * @param referencedColumns - Set to collect column names
   */
  private extractColumnReferences(expr: any, referencedColumns: Set<string>): void {
    if (!expr || typeof expr !== 'object') return;

    // Column reference found
    if (expr.type === 'column_ref') {
      // Handle qualified names (table.column)
      const colName = expr.table ? `${expr.table}.${expr.column}` : expr.column;
      if (typeof colName === 'string') {
        referencedColumns.add(colName);
      }
      return;
    }

    // Skip SQL functions - these are not field references
    // But still check function arguments for column references
    if (expr.type === 'function') {
      if (expr.args) {
        const args = expr.args.value || expr.args;
        const argsArray = Array.isArray(args) ? args : [args];
        for (const arg of argsArray) {
          if (arg) this.extractColumnReferences(arg, referencedColumns);
        }
      }
      return;
    }

    // Recursively traverse binary expressions (AND, OR, comparisons)
    if (expr.left) this.extractColumnReferences(expr.left, referencedColumns);
    if (expr.right) this.extractColumnReferences(expr.right, referencedColumns);

    // Handle IN clauses and arrays
    if (expr.value && Array.isArray(expr.value)) {
      for (const item of expr.value) {
        this.extractColumnReferences(item, referencedColumns);
      }
    }

    // Handle CASE expressions
    if (expr.result) this.extractColumnReferences(expr.result, referencedColumns);
    if (expr.expr) this.extractColumnReferences(expr.expr, referencedColumns);

    // Handle function args (different structure than type:'function')
    if (expr.args) {
      const args = Array.isArray(expr.args) ? expr.args : [expr.args];
      for (const arg of args) {
        if (arg && typeof arg === 'object') {
          if (arg.value) {
            this.extractColumnReferences(arg.value, referencedColumns);
          } else {
            this.extractColumnReferences(arg, referencedColumns);
          }
        }
      }
    }
  }

  /**
   * Fallback regex-based validation for when SQL parsing fails
   *
   * Less accurate than AST parsing but handles edge cases.
   * Violations from regex fallback have 'high' severity instead of 'critical'
   * to indicate less certainty.
   *
   * @param whereClause - SQL WHERE clause
   * @param entityName - Entity name for context
   * @param fieldNames - Valid field names
   * @param fieldNamesLower - Lowercase field names
   * @param caseSensitive - Whether to check case sensitivity
   * @param context - Validation context
   * @param constraint - Constraint definition
   * @returns Array of violations
   */
  private validateWithRegex(
    whereClause: string,
    entityName: string,
    fieldNames: string[],
    fieldNamesLower: string[],
    caseSensitive: boolean,
    context: ValidationContext,
    constraint: PropertyConstraint
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // Simple regex to extract potential field names
    // Matches word characters that could be identifiers
    const fieldPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

    let match;
    const checkedFields = new Set<string>();

    while ((match = fieldPattern.exec(whereClause)) !== null) {
      const identifier = match[1];

      // Skip SQL keywords
      if (SqlWhereClauseValidator.SQL_KEYWORDS.has(identifier.toUpperCase())) {
        continue;
      }

      // Skip duplicates
      if (checkedFields.has(identifier.toLowerCase())) {
        continue;
      }
      checkedFields.add(identifier.toLowerCase());

      // Check if field exists
      let fieldExists = false;
      let correctCaseName: string | null = null;

      if (caseSensitive) {
        fieldExists = fieldNames.includes(identifier);
      } else {
        const index = fieldNamesLower.indexOf(identifier.toLowerCase());
        fieldExists = index !== -1;
        if (fieldExists) {
          correctCaseName = fieldNames[index];
        }
      }

      if (!fieldExists) {
        const similarFields = this.findSimilar(identifier, fieldNames, 3, 3);
        let suggestion = '';

        if (similarFields.length > 0) {
          suggestion = `Did you mean: ${this.formatValueList(similarFields, 3)}?`;
        } else {
          suggestion = `Available fields: ${this.formatValueList(fieldNames, 10)}`;
        }

        violations.push(
          this.createViolation(
            'invalid-field-reference',
            this.applyErrorTemplate(
              constraint,
              context,
              `Possible invalid field '${identifier}' in WHERE clause (entity: '${entityName}')`,
              {
                field: identifier,
                entityName,
              }
            ),
            'high', // Lower severity for regex fallback (less certain)
            suggestion,
            {
              field: identifier,
              entityName,
              availableFields: fieldNames,
              similarFields,
              validationMethod: 'regex-fallback',
            }
          )
        );
      } else if (!caseSensitive && correctCaseName && correctCaseName !== identifier) {
        violations.push(
          this.createViolation(
            'case-mismatch',
            this.applyErrorTemplate(
              constraint,
              context,
              `Field '${identifier}' case doesn't match schema in WHERE clause. Expected '${correctCaseName}'`,
              {
                field: identifier,
                correctCase: correctCaseName,
                entityName,
              }
            ),
            'medium',
            `Use '${correctCaseName}' instead of '${identifier}'`,
            {
              field: identifier,
              correctCase: correctCaseName,
              entityName,
              validationMethod: 'regex-fallback',
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
    return 'Validates SQL WHERE clauses for syntax and field references using AST parsing';
  }
}
