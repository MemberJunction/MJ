import { RunQuerySQLFilterManager, DatabasePlatform } from '@memberjunction/core';
import { MJQueryParameterEntity } from '@memberjunction/core-entities';
import nunjucks from 'nunjucks';

/**
 * Minimal interface for the query metadata needed by processQueryTemplate.
 * Both `QueryInfo` (saved queries) and plain objects (transient specs) satisfy this shape.
 * This decouples template processing from requiring a full database-backed QueryInfo.
 */
export interface QueryTemplateInput {
    /** The SQL query text (used as fallback if no sqlOverride is provided) */
    SQL: string;
    /** Whether this query uses Nunjucks template syntax */
    UsesTemplate: boolean;
    /** Parameter definitions for validation and type conversion */
    Parameters: MJQueryParameterEntity[];
}

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
/**
 * One entry of a `MJ: Query Parameters.ValidationFilters` chain, coerced from the stored JSON.
 * `name` selects the filter (see applySingleValidationFilter for the full vocabulary);
 * `args` carries positional arguments (e.g. the bound for min/max).
 */
interface ValidationFilterDef {
    name: string;
    args?: unknown[];
}

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
     * Parses the JSON validation filters string into an array of typed filter definitions.
     * Mirrors the logic from the former `QueryParameterInfo.ParsedFilters` getter, but coerces
     * the result to the declared `{ name, args? }` shape (per the `ValidationFilters` column
     * description) and discards any malformed entries (non-object, or missing a string `name`)
     * so downstream enforcement never has to defend against arbitrary JSON.
     */
    private static parseFilters(validationFilters: string): ValidationFilterDef[] {
        try {
            const raw: unknown = validationFilters ? JSON.parse(validationFilters) : [];
            if (!Array.isArray(raw)) {
                return [];
            }
            const filters: ValidationFilterDef[] = [];
            for (const entry of raw) {
                if (entry && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string') {
                    const obj = entry as { name: string; args?: unknown };
                    filters.push({ name: obj.name, args: Array.isArray(obj.args) ? obj.args : undefined });
                }
            }
            return filters;
        } catch {
            return [];
        }
    }

    /**
     * Applies the declared validation-filter chain to a single (already type-converted) parameter
     * value, IN ORDER. Validation filters reject on violation (returning an `error`); transformation
     * filters rewrite the value and pass it to the next filter. The first violation short-circuits the
     * chain, so callers get one clear error per parameter.
     *
     * Implements exactly the vocabulary documented on the `MJ: Query Parameters.ValidationFilters`
     * column — validation (`required`, `email`, `min`, `max`), transformation (`trim`, `upper`,
     * `lower`), SQL safety (`sqlsafe`, `sqljoin`), and type conversion (`number`, `date`). An
     * unrecognized filter name is itself a violation (a false-promise guard): a declared filter that
     * cannot be honored fails loudly rather than silently no-op'ing, which was the original defect.
     */
    private static applyValidationFilters(
        paramName: string,
        value: unknown,
        filters: ValidationFilterDef[]
    ): { value: unknown; error?: string } {
        let current = value;
        for (const filter of filters) {
            const name = filter.name.trim().toLowerCase();
            const args = filter.args ?? [];
            const outcome = QueryParameterProcessor.applySingleValidationFilter(paramName, name, current, args);
            if (outcome.error) {
                return { value: current, error: outcome.error };
            }
            current = outcome.value;
        }
        return { value: current };
    }

    /** True for values a `required` filter (and the empty checks) treat as "not provided". */
    private static isEmptyValue(value: unknown): boolean {
        return value === undefined || value === null || value === '';
    }

    /** Coerce a value to a finite number when possible; NaN otherwise (used by min/max/number). */
    private static toFiniteNumber(value: unknown): number {
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string' && value.trim() !== '') {
            return Number(value);
        }
        return Number.NaN;
    }

    /** Characters that would let a string value break out of a SQL literal / start an injection. */
    private static readonly SQL_UNSAFE_PATTERN = /['";\\]|--|\/\*|\*\//;

    /**
     * Applies ONE named validation filter. Returns the (possibly transformed) value on success, or an
     * `error` string on violation. Kept small and switch-driven so each declared filter's semantics
     * are individually auditable.
     */
    private static applySingleValidationFilter(
        paramName: string,
        name: string,
        value: unknown,
        args: unknown[]
    ): { value: unknown; error?: string } {
        const fail = (reason: string): { value: unknown; error: string } => ({
            value,
            error: `Parameter '${paramName}' failed validation filter '${name}': ${reason}`
        });

        switch (name) {
            case 'required':
                return QueryParameterProcessor.isEmptyValue(value) ? fail('a value is required') : { value };

            case 'email': {
                const str = String(value);
                const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return emailPattern.test(str) ? { value } : fail(`'${str}' is not a valid email address`);
            }

            case 'min':
            case 'max': {
                const bound = QueryParameterProcessor.toFiniteNumber(args[0]);
                if (Number.isNaN(bound)) {
                    return fail(`filter '${name}' requires a numeric argument`);
                }
                // Numeric value → compare numerically; otherwise compare string length.
                const numeric = QueryParameterProcessor.toFiniteNumber(value);
                const comparand = Number.isNaN(numeric) ? String(value).length : numeric;
                const subject = Number.isNaN(numeric) ? 'length' : 'value';
                if (name === 'min' && comparand < bound) {
                    return fail(`${subject} ${comparand} is below the minimum of ${bound}`);
                }
                if (name === 'max' && comparand > bound) {
                    return fail(`${subject} ${comparand} exceeds the maximum of ${bound}`);
                }
                return { value };
            }

            case 'trim':
                return { value: typeof value === 'string' ? value.trim() : value };

            case 'upper':
                return { value: typeof value === 'string' ? value.toUpperCase() : value };

            case 'lower':
                return { value: typeof value === 'string' ? value.toLowerCase() : value };

            case 'number': {
                const num = QueryParameterProcessor.toFiniteNumber(value);
                return Number.isNaN(num) ? fail(`'${String(value)}' is not a valid number`) : { value: num };
            }

            case 'date': {
                const date = value instanceof Date ? value : new Date(String(value));
                return Number.isNaN(date.getTime())
                    ? fail(`'${String(value)}' is not a valid date`)
                    : { value: date.toISOString() };
            }

            case 'sqlsafe': {
                const str = String(value);
                return QueryParameterProcessor.SQL_UNSAFE_PATTERN.test(str)
                    ? fail('value contains SQL metacharacters')
                    : { value };
            }

            case 'sqljoin': {
                if (!Array.isArray(value)) {
                    return fail('filter requires an array value');
                }
                for (const element of value) {
                    if (QueryParameterProcessor.SQL_UNSAFE_PATTERN.test(String(element))) {
                        return fail(`array element '${String(element)}' contains SQL metacharacters`);
                    }
                }
                return { value };
            }

            default:
                // A declared filter we don't recognize is a broken contract, not a no-op — surface it.
                return fail('unknown validation filter');
        }
    }

    /**
     * Validates parameters against their definitions.
     * Boolean handling is platform-aware:
     * - SQL Server: converts to 1/0 (BIT fields)
     * - PostgreSQL: keeps as true/false (native boolean)
     */
    public static validateParameters(
        parameters: Record<string, unknown> | undefined,
        parameterDefinitions: MJQueryParameterEntity[],
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

            // DefaultValue is informational metadata only — it is NOT injected into
            // the template context. The SQL template is the single source of truth for
            // default behavior via {% else %} blocks or Nunjucks | default() filters.
            // Attempting to parse DefaultValue as JavaScript caused a class of bugs
            // where SQL expressions (GETDATE(), ('Cancelled','Refunded'), etc.) were
            // rejected by the JS type parser.
            const finalValue = value;

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

                    // Apply the declared validation-filter chain (in order). Validation filters
                    // reject on violation; transformation/type-conversion filters rewrite the value.
                    if (paramDef.ValidationFilters) {
                        const filters = QueryParameterProcessor.parseFilters(paramDef.ValidationFilters);
                        if (filters.length > 0) {
                            const filtered = QueryParameterProcessor.applyValidationFilters(
                                paramDef.Name,
                                validatedParams[paramDef.Name],
                                filters
                            );
                            if (filtered.error) {
                                errors.push(filtered.error);
                                continue;
                            }
                            validatedParams[paramDef.Name] = filtered.value;
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
     * Accepts either a full `QueryInfo` (saved queries) or a minimal `QueryTemplateInput`
     * (transient specs) — only `SQL`, `UsesTemplate`, and `Parameters` are used.
     * @param query The query info or template input containing SQL and parameter definitions
     * @param parameters User-provided parameter values
     * @param sqlOverride Optional SQL to use instead of query.SQL (e.g., platform-resolved SQL)
     * @param forceTemplateProcessing When true, processes Nunjucks templates even if the query's
     *        own UsesTemplate is false. Used for transitive template resolution when a composed
     *        dependency uses templates but the outer query does not.
     */
    public static processQueryTemplate(
        query: QueryTemplateInput,
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
