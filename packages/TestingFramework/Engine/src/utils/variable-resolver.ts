/**
 * @fileoverview Variable resolution service for the Testing Framework
 * @module @memberjunction/testing-engine
 */

import { SafeJSONParse } from '@memberjunction/global';
import {
  TestTypeVariablesSchema,
  TestVariablesConfig,
  TestSuiteVariablesConfig,
  TestVariableDefinition,
  TestVariableOverride,
  TestRunOptions,
  ResolvedTestVariables,
  TestVariableValue
} from '@memberjunction/testing-engine-base';

/**
 * Error thrown when variable resolution fails
 */
export class VariableResolutionError extends Error {
  constructor(
    message: string,
    public readonly variableName?: string,
    public readonly reason?: 'missing_required' | 'invalid_type' | 'invalid_value' | 'parse_error'
  ) {
    super(message);
    this.name = 'VariableResolutionError';
  }
}

/**
 * Result from resolving a single variable value
 */
interface SingleVariableResolution {
  value: TestVariableValue | undefined;
  source: 'run' | 'suite' | 'test' | 'type' | '';
}

/**
 * Service for resolving test variables through the inheritance hierarchy.
 *
 * Resolution order (highest to lowest priority):
 * 1. Run-level values (CLI flags, API params)
 * 2. Suite-level values (if running in a suite)
 * 3. Test-level defaults
 * 4. TestType defaults
 */
export class VariableResolver {
  /**
   * Resolve variables for a test execution.
   *
   * @param typeVariablesSchemaJson - JSON string from TestType.VariablesSchema
   * @param testVariablesJson - JSON string from Test.Variables (optional)
   * @param suiteVariablesJson - JSON string from TestSuite.Variables (optional)
   * @param runOptions - Runtime options containing user-provided variable values
   * @returns Resolved variables with values and sources
   * @throws VariableResolutionError if required variables are missing or values are invalid
   */
  resolveVariables(
    typeVariablesSchemaJson: string | null,
    testVariablesJson: string | null,
    suiteVariablesJson: string | null,
    runOptions: TestRunOptions
  ): ResolvedTestVariables {
    // Parse schemas
    const typeSchema = this.parseTypeSchema(typeVariablesSchemaJson);
    const testConfig = this.parseTestConfig(testVariablesJson);
    const suiteConfig = this.parseSuiteConfig(suiteVariablesJson);

    // If no type schema, return empty resolved variables
    if (!typeSchema || typeSchema.variables.length === 0) {
      return { values: {}, sources: {} };
    }

    const values: Record<string, TestVariableValue> = {};
    const sources: Record<string, 'run' | 'suite' | 'test' | 'type'> = {};

    // Process each variable defined in the type schema
    for (const varDef of typeSchema.variables) {
      const testOverride = testConfig?.variables?.[varDef.name];

      // Check if test explicitly marks this variable as not exposed
      if (testOverride && testOverride.exposed === false) {
        continue; // Variable not exposed by this test, skip it
      }

      // Resolve the value through the priority hierarchy
      const resolved = this.resolveValue(varDef, testOverride, suiteConfig, runOptions);

      if (resolved.value !== undefined) {
        values[varDef.name] = resolved.value;
        sources[varDef.name] = resolved.source as 'run' | 'suite' | 'test' | 'type';
      } else if (varDef.required) {
        throw new VariableResolutionError(
          `Required variable '${varDef.name}' has no value. ` +
          `Provide a value via --var ${varDef.name}=<value> or set a default.`,
          varDef.name,
          'missing_required'
        );
      }
    }

    return { values, sources };
  }

  /**
   * Parse the TestType.VariablesSchema JSON
   */
  parseTypeSchema(json: string | null): TestTypeVariablesSchema | null {
    if (!json) {
      return null;
    }

    const parsed = SafeJSONParse(json);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    // Validate schema version
    if (parsed.schemaVersion !== '1.0') {
      throw new VariableResolutionError(
        `Unsupported variables schema version: ${parsed.schemaVersion}. Expected '1.0'.`,
        undefined,
        'parse_error'
      );
    }

    return parsed as TestTypeVariablesSchema;
  }

  /**
   * Parse the Test.Variables JSON
   */
  parseTestConfig(json: string | null): TestVariablesConfig | null {
    if (!json) {
      return null;
    }

    const parsed = SafeJSONParse(json);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as TestVariablesConfig;
  }

  /**
   * Parse the TestSuite.Variables JSON
   */
  parseSuiteConfig(json: string | null): TestSuiteVariablesConfig | null {
    if (!json) {
      return null;
    }

    const parsed = SafeJSONParse(json);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as TestSuiteVariablesConfig;
  }

  /**
   * Resolve a single variable value through the priority hierarchy.
   *
   * Priority order:
   * 1. If locked at test level, use test/type default (no override allowed)
   * 2. Run-level value
   * 3. Suite-level value
   * 4. Test-level default
   * 5. Type-level default
   */
  private resolveValue(
    varDef: TestVariableDefinition,
    testOverride: TestVariableOverride | undefined,
    suiteConfig: TestSuiteVariablesConfig | null,
    runOptions: TestRunOptions
  ): SingleVariableResolution {
    // If variable is locked at test level, use test default (or type default)
    if (testOverride?.locked) {
      const value = testOverride.defaultValue ?? varDef.defaultValue;
      return {
        value: value as TestVariableValue | undefined,
        source: testOverride.defaultValue !== undefined ? 'test' : 'type'
      };
    }

    // Priority 1: Run-level value
    if (runOptions.variables?.[varDef.name] !== undefined) {
      const value = runOptions.variables[varDef.name];
      this.validateValue(varDef, testOverride, value, 'run');
      return { value: value as TestVariableValue, source: 'run' };
    }

    // Priority 2: Suite-level value
    if (suiteConfig?.variables?.[varDef.name] !== undefined) {
      const value = suiteConfig.variables[varDef.name];
      this.validateValue(varDef, testOverride, value, 'suite');
      return { value: value as TestVariableValue, source: 'suite' };
    }

    // Priority 3: Test-level default
    if (testOverride?.defaultValue !== undefined) {
      return { value: testOverride.defaultValue as TestVariableValue, source: 'test' };
    }

    // Priority 4: Type-level default
    if (varDef.defaultValue !== undefined) {
      return { value: varDef.defaultValue as TestVariableValue, source: 'type' };
    }

    return { value: undefined, source: '' };
  }

  /**
   * Validate a variable value against its definition.
   */
  validateValue(
    varDef: TestVariableDefinition,
    testOverride: TestVariableOverride | undefined,
    value: unknown,
    source: string
  ): void {
    // Type validation
    this.validateDataType(varDef, value);

    // Check against possible values (static source)
    if (varDef.valueSource === 'static' && varDef.possibleValues && varDef.possibleValues.length > 0) {
      // Get allowed values (test-restricted or all from type)
      const allowedValues = testOverride?.restrictedValues
        ?? varDef.possibleValues.map(pv => pv.value);

      if (!allowedValues.includes(value as string | number | boolean)) {
        throw new VariableResolutionError(
          `Variable '${varDef.name}' value '${value}' (from ${source}) is not in allowed values: [${allowedValues.join(', ')}]`,
          varDef.name,
          'invalid_value'
        );
      }
    }
  }

  /**
   * Validate value matches the expected data type.
   */
  validateDataType(varDef: TestVariableDefinition, value: unknown): void {
    const actualType = typeof value;

    switch (varDef.dataType) {
      case 'string':
        if (actualType !== 'string') {
          throw new VariableResolutionError(
            `Variable '${varDef.name}' expected type 'string' but got '${actualType}'`,
            varDef.name,
            'invalid_type'
          );
        }
        break;

      case 'number':
        if (actualType !== 'number' || isNaN(value as number)) {
          throw new VariableResolutionError(
            `Variable '${varDef.name}' expected type 'number' but got '${actualType}'`,
            varDef.name,
            'invalid_type'
          );
        }
        break;

      case 'boolean':
        if (actualType !== 'boolean') {
          throw new VariableResolutionError(
            `Variable '${varDef.name}' expected type 'boolean' but got '${actualType}'`,
            varDef.name,
            'invalid_type'
          );
        }
        break;

      case 'date':
        // Date can be a string (ISO format) or Date object
        if (!(value instanceof Date) && (actualType !== 'string' || isNaN(Date.parse(value as string)))) {
          throw new VariableResolutionError(
            `Variable '${varDef.name}' expected type 'date' but got '${actualType}'`,
            varDef.name,
            'invalid_type'
          );
        }
        break;
    }
  }

  /**
   * Get available variables for a test (combines type and test configuration).
   * Useful for CLI help and variable listing.
   */
  getAvailableVariables(
    typeVariablesSchemaJson: string | null,
    testVariablesJson: string | null
  ): TestVariableDefinition[] {
    const typeSchema = this.parseTypeSchema(typeVariablesSchemaJson);
    const testConfig = this.parseTestConfig(testVariablesJson);

    if (!typeSchema) {
      return [];
    }

    // Filter to only exposed variables and apply test-level overrides
    return typeSchema.variables
      .filter(varDef => {
        const testOverride = testConfig?.variables?.[varDef.name];
        // Include if no override or explicitly exposed
        return !testOverride || testOverride.exposed !== false;
      })
      .map(varDef => {
        const testOverride = testConfig?.variables?.[varDef.name];

        // Apply test-level overrides to the definition
        if (testOverride) {
          return {
            ...varDef,
            defaultValue: testOverride.defaultValue ?? varDef.defaultValue,
            // Restrict possible values if specified
            possibleValues: testOverride.restrictedValues
              ? varDef.possibleValues?.filter(pv => testOverride.restrictedValues!.includes(pv.value))
              : varDef.possibleValues
          };
        }

        return varDef;
      });
  }

  /**
   * Parse a variable value from a CLI string.
   * Converts string input to appropriate type based on variable definition.
   */
  parseCliValue(
    varDef: TestVariableDefinition,
    cliValue: string
  ): TestVariableValue {
    switch (varDef.dataType) {
      case 'string':
        return cliValue;

      case 'number': {
        const num = parseFloat(cliValue);
        if (isNaN(num)) {
          throw new VariableResolutionError(
            `Cannot parse '${cliValue}' as number for variable '${varDef.name}'`,
            varDef.name,
            'invalid_type'
          );
        }
        return num;
      }

      case 'boolean': {
        const lower = cliValue.toLowerCase();
        if (lower === 'true' || lower === '1' || lower === 'yes') {
          return true;
        }
        if (lower === 'false' || lower === '0' || lower === 'no') {
          return false;
        }
        throw new VariableResolutionError(
          `Cannot parse '${cliValue}' as boolean for variable '${varDef.name}'. Use true/false, 1/0, or yes/no.`,
          varDef.name,
          'invalid_type'
        );
      }

      case 'date': {
        const date = new Date(cliValue);
        if (isNaN(date.getTime())) {
          throw new VariableResolutionError(
            `Cannot parse '${cliValue}' as date for variable '${varDef.name}'`,
            varDef.name,
            'invalid_type'
          );
        }
        return date;
      }

      default:
        return cliValue;
    }
  }

  /**
   * Parse CLI variable arguments (name=value format) into a variables object.
   * If type schema is provided, values are converted to appropriate types.
   */
  parseCliVariables(
    cliArgs: string[],
    typeVariablesSchemaJson?: string | null
  ): Record<string, TestVariableValue> {
    const typeSchema = typeVariablesSchemaJson ? this.parseTypeSchema(typeVariablesSchemaJson) : null;
    const result: Record<string, TestVariableValue> = {};

    for (const arg of cliArgs) {
      const eqIndex = arg.indexOf('=');
      if (eqIndex === -1) {
        throw new VariableResolutionError(
          `Invalid variable format: '${arg}'. Expected format: name=value`,
          undefined,
          'parse_error'
        );
      }

      const name = arg.substring(0, eqIndex);
      const valueStr = arg.substring(eqIndex + 1);

      // Find variable definition for type conversion
      const varDef = typeSchema?.variables.find(v => v.name === name);

      if (varDef) {
        result[name] = this.parseCliValue(varDef, valueStr);
      } else {
        // No type info, keep as string
        result[name] = valueStr;
      }
    }

    return result;
  }
}
