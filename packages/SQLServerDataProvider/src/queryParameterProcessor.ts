import { QueryInfo, QueryParameterInfo, RunQuerySQLFilterManager } from '@memberjunction/core';
import nunjucks from 'nunjucks';

/**
 * Result of parameter validation
 */
export interface ParameterValidationResult {
    /**
     * Whether all parameters passed validation
     */
    success: boolean;
    /**
     * Error messages for any validation failures
     */
    errors: string[];
    /**
     * The validated and type-converted parameters
     */
    validatedParameters: Record<string, any>;
}

/**
 * Result of processing a query template
 */
export interface QueryProcessingResult {
    /**
     * Whether template processing was successful
     */
    success: boolean;
    /**
     * The processed SQL query with parameters substituted
     */
    processedSQL: string;
    /**
     * Error message if processing failed
     */
    error?: string;
    /**
     * The final parameters that were applied, including defaults
     */
    appliedParameters: Record<string, any>;
}

/**
 * Handles parameter validation and query template processing for parameterized queries.
 * Provides type conversion, validation, and secure template processing using Nunjucks.
 */
export class QueryParameterProcessor {
    private static _nunjucksEnv: nunjucks.Environment;

    /**
     * Gets or creates the Nunjucks environment with custom SQL-safe filters
     */
    private static get nunjucksEnv(): nunjucks.Environment {
        if (!this._nunjucksEnv) {
            this._nunjucksEnv = new nunjucks.Environment(null, {
                autoescape: false,
                throwOnUndefined: true,
                trimBlocks: true,
                lstripBlocks: true
            });

            // Add custom SQL-safe filters from the RunQuerySQLFilterManager
            const filterManager = RunQuerySQLFilterManager.Instance;
            const filters = filterManager.getAllFilters();
            
            for (const filter of filters) {
                if (filter.implementation) {
                    this._nunjucksEnv.addFilter(filter.name, filter.implementation);
                }
            }
        }
        return this._nunjucksEnv;
    }

    /**
     * Validates parameters against their definitions
     */
    public static validateParameters(
        parameters: Record<string, any> | undefined,
        parameterDefinitions: QueryParameterInfo[]
    ): ParameterValidationResult {
        const errors: string[] = [];
        const validatedParams: Record<string, any> = {};

        // Process each defined parameter
        for (const paramDef of parameterDefinitions) {
            const value = parameters?.[paramDef.Name];
            
            // Check required parameters
            if (paramDef.IsRequired && (value === undefined || value === null || value === '')) {
                errors.push(`Required parameter '${paramDef.Name}' is missing`);
                continue;
            }

            // Use default value if not provided
            let finalValue = value;
            if ((finalValue === undefined || finalValue === null) && paramDef.DefaultValue !== null) {
                try {
                    // Parse default value based on type
                    switch (paramDef.Type) {
                        case 'number':
                            finalValue = Number(paramDef.DefaultValue);
                            break;
                        case 'boolean':
                            finalValue = paramDef.DefaultValue.toLowerCase() === 'true';
                            break;
                        case 'date':
                            finalValue = new Date(paramDef.DefaultValue);
                            break;
                        case 'array':
                            finalValue = JSON.parse(paramDef.DefaultValue);
                            break;
                        default:
                            finalValue = paramDef.DefaultValue;
                    }
                } catch (e) {
                    errors.push(`Failed to parse default value for parameter '${paramDef.Name}': ${e.message}`);
                    continue;
                }
            }

            // Type conversion and validation
            if (finalValue !== undefined && finalValue !== null) {
                try {
                    switch (paramDef.Type) {
                        case 'string':
                            validatedParams[paramDef.Name] = String(finalValue);
                            break;
                        case 'number':
                            const num = Number(finalValue);
                            if (isNaN(num)) {
                                errors.push(`Parameter '${paramDef.Name}' must be a number`);
                                continue;
                            }
                            validatedParams[paramDef.Name] = num;
                            break;
                        case 'date':
                            const date = finalValue instanceof Date ? finalValue : new Date(finalValue);
                            if (isNaN(date.getTime())) {
                                errors.push(`Parameter '${paramDef.Name}' must be a valid date`);
                                continue;
                            }
                            // Store as ISO string for SQL compatibility - Date.toString() produces
                            // format like "Mon Jan 26 2026..." which SQL Server cannot parse
                            validatedParams[paramDef.Name] = date.toISOString();
                            break;
                        case 'boolean':
                            // Convert to 0/1 for SQL Server bit fields
                            // This ensures proper SQL syntax: WHERE BitColumn = 1 (not WHERE BitColumn = true)
                            if (typeof finalValue === 'boolean') {
                                validatedParams[paramDef.Name] = finalValue ? 1 : 0;
                            } else {
                                validatedParams[paramDef.Name] = String(finalValue).toLowerCase() === 'true' ? 1 : 0;
                            }
                            break;
                        case 'array':
                            if (Array.isArray(finalValue)) {
                                validatedParams[paramDef.Name] = finalValue;
                            } else if (typeof finalValue === 'string') {
                                try {
                                    validatedParams[paramDef.Name] = JSON.parse(finalValue);
                                } catch {
                                    errors.push(`Parameter '${paramDef.Name}' must be a valid JSON array`);
                                    continue;
                                }
                            } else {
                                errors.push(`Parameter '${paramDef.Name}' must be an array`);
                                continue;
                            }
                            break;
                        default:
                            validatedParams[paramDef.Name] = finalValue;
                    }

                    // Apply validation filters if any
                    if (paramDef.ValidationFilters) {
                        const filters = paramDef.ParsedFilters;
                        for (const filter of filters) {
                            // This is where custom validation logic would go
                            // For now, we'll just log that we would apply filters
                            // In a real implementation, you'd apply the filter rules
                        }
                    }
                } catch (e) {
                    errors.push(`Error processing parameter '${paramDef.Name}': ${e.message}`);
                }
            }
        }

        // Check for unknown parameters
        if (parameters) {
            const definedParamNames = new Set(parameterDefinitions.map(p => p.Name));
            for (const key of Object.keys(parameters)) {
                if (!definedParamNames.has(key)) {
                    errors.push(`Unknown parameter: '${key}'`);
                }
            }
        }

        return {
            success: errors.length === 0,
            errors,
            validatedParameters: validatedParams
        };
    }

    /**
     * Processes a query template with the provided parameters
     */
    public static processQueryTemplate(
        query: QueryInfo,
        parameters: Record<string, any> | undefined
    ): QueryProcessingResult {
        try {
            // If query doesn't use templates, return the SQL as-is
            if (!query.UsesTemplate) {
                return {
                    success: true,
                    processedSQL: query.SQL,
                    appliedParameters: {}
                };
            }

            // Validate parameters
            const validation = this.validateParameters(parameters, query.Parameters);
            if (!validation.success) {
                return {
                    success: false,
                    processedSQL: '',
                    error: `Parameter validation failed: ${validation.errors.join('; ')}`,
                    appliedParameters: {}
                };
            }

            // Process the template
            try {
                const processedSQL = this.nunjucksEnv.renderString(
                    query.SQL,
                    validation.validatedParameters
                );

                return {
                    success: true,
                    processedSQL,
                    appliedParameters: validation.validatedParameters
                };
            } catch (e) {
                return {
                    success: false,
                    processedSQL: '',
                    error: `Template processing failed: ${e.message}`,
                    appliedParameters: validation.validatedParameters
                };
            }
        } catch (e) {
            return {
                success: false,
                processedSQL: '',
                error: `Unexpected error during query processing: ${e.message}`,
                appliedParameters: {}
            };
        }
    }
}