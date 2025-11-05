import fs from 'fs/promises';
import path from 'path';
import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import {
  EvalDefinition,
  EvalValidationOptions,
  EvalValidationResult,
  EvalValidationError,
} from './types';

/**
 * JSON Schema for AI Eval definitions
 */
const evalSchema: JSONSchemaType<EvalDefinition> = {
  type: 'object',
  properties: {
    eval_id: { type: 'string' },
    category: {
      type: 'string',
      enum: ['simple_aggregation', 'trend', 'cross_domain', 'drill_down', 'complex']
    },
    difficulty: {
      type: 'string',
      enum: ['easy', 'medium', 'hard', 'very_hard']
    },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    business_context: { type: 'string' },
    prompt: { type: 'string' },
    expected_outcome: {
      type: 'object',
      properties: {
        data_assertions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              metric: { type: 'string' },
              expected_range: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                nullable: true
              },
              expected_value: { nullable: true },
              sql_validation: { type: 'string', nullable: true },
              description: { type: 'string' }
            },
            required: ['metric', 'description']
          }
        },
        visualization: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            alternatives: {
              type: 'array',
              items: { type: 'string' },
              nullable: true
            },
            should_not_be: {
              type: 'array',
              items: { type: 'string' },
              nullable: true
            },
            reasoning: { type: 'string' }
          },
          required: ['type', 'reasoning']
        },
        required_features: {
          type: 'array',
          items: { type: 'string' }
        },
        optional_features: {
          type: 'array',
          items: { type: 'string' },
          nullable: true
        },
        interactivity: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string' },
              expected_result: { type: 'string' }
            },
            required: ['action', 'expected_result']
          },
          nullable: true
        }
      },
      required: ['data_assertions', 'visualization', 'required_features']
    },
    validation_criteria: {
      type: 'object',
      properties: {
        data_correctness: { type: 'number' },
        visualization_choice: { type: 'number' },
        interactivity: { type: 'number' },
        performance: { type: 'number' }
      },
      required: ['data_correctness', 'visualization_choice', 'interactivity', 'performance']
    },
    sample_sql: { type: 'string', nullable: true },
    human_eval_guidance: { type: 'string' },
    common_pitfalls: { type: 'string' }
  },
  required: [
    'eval_id',
    'category',
    'difficulty',
    'tags',
    'business_context',
    'prompt',
    'expected_outcome',
    'validation_criteria',
    'human_eval_guidance',
    'common_pitfalls'
  ]
};

/**
 * Service for validating AI Eval JSON files
 */
export class EvalValidator {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
  }

  /**
   * Validate all eval files in a directory
   */
  async validateDirectory(options: EvalValidationOptions): Promise<EvalValidationResult> {
    const errors: EvalValidationError[] = [];
    const warnings: EvalValidationError[] = [];
    let validEvals = 0;
    let totalEvals = 0;

    try {
      const evalFiles = await this.findEvalFiles(options.directory);
      totalEvals = evalFiles.length;

      if (options.verbose) {
        console.log(`Found ${totalEvals} eval files to validate`);
      }

      for (const filePath of evalFiles) {
        const fileErrors = await this.validateFile(filePath, options);
        errors.push(...fileErrors.errors);
        warnings.push(...fileErrors.warnings);

        if (fileErrors.errors.length === 0) {
          validEvals++;
        }
      }

    } catch (error: any) {
      errors.push({
        eval_id: 'unknown',
        file_path: options.directory,
        error_type: 'schema',
        message: `Failed to validate directory: ${error.message}`,
      });
    }

    return {
      is_valid: errors.length === 0,
      total_evals: totalEvals,
      valid_evals: validEvals,
      errors,
      warnings,
    };
  }

  /**
   * Validate a single eval file
   */
  async validateFile(
    filePath: string,
    options: EvalValidationOptions
  ): Promise<{ errors: EvalValidationError[]; warnings: EvalValidationError[] }> {
    const errors: EvalValidationError[] = [];
    const warnings: EvalValidationError[] = [];

    try {
      // Read and parse JSON
      const content = await fs.readFile(filePath, 'utf-8');
      let evalDef: EvalDefinition;

      try {
        evalDef = JSON.parse(content);
      } catch (parseError: any) {
        errors.push({
          eval_id: 'unknown',
          file_path: filePath,
          error_type: 'schema',
          message: `Failed to parse JSON: ${parseError.message}`,
          suggestion: 'Check for syntax errors in JSON file',
        });
        return { errors, warnings };
      }

      // Schema validation
      const validate = this.ajv.compile(evalSchema);
      const valid = validate(evalDef);

      if (!valid && validate.errors) {
        for (const error of validate.errors) {
          errors.push({
            eval_id: evalDef.eval_id || 'unknown',
            file_path: filePath,
            error_type: 'schema',
            field: error.instancePath,
            message: `${error.instancePath} ${error.message}`,
            suggestion: this.getSuggestionForSchemaError(error),
          });
        }
      }

      // Business logic validation
      const businessErrors = this.validateBusinessLogic(evalDef, filePath);
      errors.push(...businessErrors);

      // SQL validation (if enabled)
      if (options.check_sql && valid) {
        const sqlErrors = await this.validateSQL(evalDef, filePath);
        errors.push(...sqlErrors);
      }

      // Best practice warnings
      const practiceWarnings = this.checkBestPractices(evalDef, filePath);
      warnings.push(...practiceWarnings);

    } catch (error: any) {
      errors.push({
        eval_id: 'unknown',
        file_path: filePath,
        error_type: 'schema',
        message: `Failed to validate file: ${error.message}`,
      });
    }

    return { errors, warnings };
  }

  /**
   * Find all eval JSON files in directory
   */
  private async findEvalFiles(directory: string): Promise<string[]> {
    const evalFiles: string[] = [];

    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.')) {
          evalFiles.push(fullPath);
        }
      }
    }

    await scan(directory);
    return evalFiles;
  }

  /**
   * Validate business logic rules
   */
  private validateBusinessLogic(evalDef: EvalDefinition, filePath: string): EvalValidationError[] {
    const errors: EvalValidationError[] = [];

    // Validation criteria should sum to 1.0
    const criteriaSum =
      evalDef.validation_criteria.data_correctness +
      evalDef.validation_criteria.visualization_choice +
      evalDef.validation_criteria.interactivity +
      evalDef.validation_criteria.performance;

    if (Math.abs(criteriaSum - 1.0) > 0.01) {
      errors.push({
        eval_id: evalDef.eval_id,
        file_path: filePath,
        error_type: 'business_logic',
        field: 'validation_criteria',
        message: `Validation criteria weights must sum to 1.0 (currently ${criteriaSum.toFixed(2)})`,
        suggestion: 'Adjust weights so they add up to exactly 1.0',
      });
    }

    // Data assertions should have either expected_range or expected_value
    for (const assertion of evalDef.expected_outcome.data_assertions) {
      if (!assertion.expected_range && assertion.expected_value === undefined) {
        errors.push({
          eval_id: evalDef.eval_id,
          file_path: filePath,
          error_type: 'business_logic',
          field: `data_assertions.${assertion.metric}`,
          message: 'Data assertion must have either expected_range or expected_value',
          suggestion: 'Add expected_range: [min, max] or expected_value: value',
        });
      }
    }

    return errors;
  }

  /**
   * Validate SQL queries
   */
  private async validateSQL(evalDef: EvalDefinition, filePath: string): Promise<EvalValidationError[]> {
    const errors: EvalValidationError[] = [];

    // Check SQL syntax for data assertions
    for (const assertion of evalDef.expected_outcome.data_assertions) {
      if (assertion.sql_validation) {
        const sqlError = this.checkSQLSyntax(assertion.sql_validation);
        if (sqlError) {
          errors.push({
            eval_id: evalDef.eval_id,
            file_path: filePath,
            error_type: 'sql',
            field: `data_assertions.${assertion.metric}.sql_validation`,
            message: sqlError,
            suggestion: 'Check SQL syntax and table/column names',
          });
        }
      }
    }

    // Check sample SQL if present
    if (evalDef.sample_sql) {
      const sqlError = this.checkSQLSyntax(evalDef.sample_sql);
      if (sqlError) {
        errors.push({
          eval_id: evalDef.eval_id,
          file_path: filePath,
          error_type: 'sql',
          field: 'sample_sql',
          message: sqlError,
          suggestion: 'Check SQL syntax and table/column names',
        });
      }
    }

    return errors;
  }

  /**
   * Check SQL syntax (basic validation)
   */
  private checkSQLSyntax(sql: string): string | null {
    // Basic SQL validation - check for common keywords
    const trimmed = sql.trim().toUpperCase();

    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH')) {
      return 'SQL must start with SELECT or WITH';
    }

    // Check for balanced parentheses
    let parenCount = 0;
    for (const char of sql) {
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (parenCount < 0) return 'Unbalanced parentheses in SQL';
    }
    if (parenCount !== 0) return 'Unbalanced parentheses in SQL';

    return null;
  }

  /**
   * Check best practices
   */
  private checkBestPractices(evalDef: EvalDefinition, filePath: string): EvalValidationError[] {
    const warnings: EvalValidationError[] = [];

    // Check prompt length
    if (evalDef.prompt.length < 10) {
      warnings.push({
        eval_id: evalDef.eval_id,
        file_path: filePath,
        error_type: 'business_logic',
        field: 'prompt',
        message: 'Prompt is very short (< 10 characters)',
        suggestion: 'Consider adding more context to the prompt',
      });
    }

    // Check tags
    if (evalDef.tags.length === 0) {
      warnings.push({
        eval_id: evalDef.eval_id,
        file_path: filePath,
        error_type: 'business_logic',
        field: 'tags',
        message: 'No tags specified',
        suggestion: 'Add tags to help categorize and find this eval',
      });
    }

    // Check for data assertions
    if (evalDef.expected_outcome.data_assertions.length === 0) {
      warnings.push({
        eval_id: evalDef.eval_id,
        file_path: filePath,
        error_type: 'business_logic',
        field: 'data_assertions',
        message: 'No data assertions specified',
        suggestion: 'Add at least one data assertion to validate results',
      });
    }

    return warnings;
  }

  /**
   * Get suggestion for schema validation error
   */
  private getSuggestionForSchemaError(error: any): string {
    if (error.keyword === 'required') {
      return `Missing required field: ${error.params.missingProperty}`;
    }
    if (error.keyword === 'enum') {
      return `Value must be one of: ${error.params.allowedValues.join(', ')}`;
    }
    if (error.keyword === 'type') {
      return `Expected type ${error.params.type}`;
    }
    return 'Check the eval JSON schema documentation';
  }
}
