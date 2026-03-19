import { QueryInfo, QueryParameterInfo, RunQuerySQLFilterManager, DatabasePlatform } from '@memberjunction/core';
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
    validatedParameters: Record<string, unknown>;
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
    appliedParameters: Record<string, unknown>;
}

/**
 * Handles parameter validation and query template processing for parameterized queries.
 * Provides type conversion, validation, and secure template processing using Nunjucks.
 *
 * Platform-aware: reads the current platform from RunQuerySQLFilterManager to handle
 * boolean conversion correctly (SQL Server BIT 1/0 vs PostgreSQL true/false).
 *
 * Shared between SQL Server and PostgreSQL data providers.
 */
export class QueryParameterProcessor {
    private static _nunjucksEnv: nunjucks.Environment | null = null;
    private static _envPlatform: DatabasePlatform | null = null;

    /**
     * Gets or creates the Nunjucks environment with custom SQL-safe filters.
     * Recreates the environment if the platform has changed since last creation,
     * because filters (sqlBoolean, sqlIdentifier) are baked in at creation time.
     */
    private static get nunjucksEnv(): nunjucks.Environment {
        const currentPlatform = RunQuerySQLFilterManager.Instance.Platform;
        if (!this._nunjucksEnv || this._envPlatform !== currentPlatform) {
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
            this._envPlatform = currentPlatform;
        }
        return this._nunjucksEnv;
    }

    /**
     * Validates parameters against their definitions.
     * Boolean handling is platform-aware:
     * - SQL Server: converts to 1/0 (BIT fields)
     * - PostgreSQL: keeps as true/false (native boolean)
     */
    public static validateParameters(
        parameters: Record<string, unknown> | undefined,
        parameterDefinitions: QueryParameterInfo[],
        skipUnknownParameterCheck?: boolean
    ): ParameterValidationResult {
        const errors: string[] = [];
        const validatedParams: Record<string, unknown> = {};
        const platform = RunQuerySQLFilterManager.Instance.Platform;

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
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`Failed to parse default value for parameter '${paramDef.Name}': ${msg}`);
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
                        case 'number': {
                            const num = Number(finalValue);
                            if (isNaN(num)) {
                                errors.push(`Parameter '${paramDef.Name}' must be a number`);
                                continue;
                            }
                            validatedParams[paramDef.Name] = num;
                            break;
                        }
                        case 'date': {
                            const date = finalValue instanceof Date ? finalValue : new Date(finalValue as string | number);
                            if (isNaN(date.getTime())) {
                                errors.push(`Parameter '${paramDef.Name}' must be a valid date`);
                                continue;
                            }
                            // Store as ISO string for SQL compatibility
                            validatedParams[paramDef.Name] = date.toISOString();
                            break;
                        }
                        case 'boolean': {
                            const boolValue = typeof finalValue === 'boolean'
                                ? finalValue
                                : String(finalValue).toLowerCase() === 'true';

                            if (platform === 'postgresql') {
                                // PostgreSQL natively supports boolean true/false
                                validatedParams[paramDef.Name] = boolValue;
                            } else {
                                // SQL Server uses BIT (1/0)
                                validatedParams[paramDef.Name] = boolValue ? 1 : 0;
                            }
                            break;
                        }
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
                        for (const _filter of filters) {
                            // Validation filter application placeholder
                        }
                    }
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    errors.push(`Error processing parameter '${paramDef.Name}': ${msg}`);
                }
            }
        }

        // Check for unknown parameters (skipped for transitive template processing
        // where the outer query doesn't define the dependency's parameters)
        if (parameters && !skipUnknownParameterCheck) {
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
     * Processes a query template with the provided parameters.
     * @param query The query info containing template SQL and parameter definitions
     * @param parameters User-provided parameter values
     * @param sqlOverride Optional SQL to use instead of query.SQL (e.g., platform-resolved SQL)
     * @param forceTemplateProcessing When true, processes Nunjucks templates even if the query's
     *        own UsesTemplate is false. Used for transitive template resolution when a composed
     *        dependency uses templates but the outer query does not.
     */
    public static processQueryTemplate(
        query: QueryInfo,
        parameters: Record<string, unknown> | undefined,
        sqlOverride?: string,
        forceTemplateProcessing?: boolean
    ): QueryProcessingResult {
        try {
            const sql = sqlOverride ?? query.SQL;

            // If query doesn't use templates (and no dependency does either), return the SQL as-is
            if (!query.UsesTemplate && !forceTemplateProcessing) {
                return {
                    success: true,
                    processedSQL: sql,
                    appliedParameters: {}
                };
            }

            // Validate parameters against known definitions.
            // When force-processing for transitive templates, the outer query may not define
            // all parameters used by dependencies, so we skip the "unknown parameter" check.
            const validation = this.validateParameters(parameters, query.Parameters, forceTemplateProcessing);
            if (!validation.success) {
                return {
                    success: false,
                    processedSQL: '',
                    error: `Parameter validation failed: ${validation.errors.join('; ')}`,
                    appliedParameters: {}
                };
            }

            // When force-processing, merge any provided parameters that weren't in query.Parameters
            // so Nunjucks can resolve dependency template tokens
            const renderParams = { ...validation.validatedParameters };
            if (forceTemplateProcessing && parameters) {
                for (const [key, value] of Object.entries(parameters)) {
                    if (!(key in renderParams)) {
                        renderParams[key] = value;
                    }
                }
            }

            // Process the template
            try {
                const processedSQL = this.nunjucksEnv.renderString(
                    sql,
                    renderParams
                );

                return {
                    success: true,
                    processedSQL,
                    appliedParameters: renderParams
                };
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                return {
                    success: false,
                    processedSQL: '',
                    error: `Template processing failed: ${msg}`,
                    appliedParameters: renderParams
                };
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            return {
                success: false,
                processedSQL: '',
                error: `Unexpected error during query processing: ${msg}`,
                appliedParameters: {}
            };
        }
    }
}
