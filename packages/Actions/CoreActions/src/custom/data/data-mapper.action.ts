import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import nunjucks from "nunjucks";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that transforms data using Nunjucks templates
 * Provides powerful templating capabilities for data transformation
 * 
 * @example
 * ```typescript
 * // Simple object mapping
 * await runAction({
 *   ActionName: 'Data Mapper',
 *   Params: [{
 *     Name: 'SourceData',
 *     Value: { user: { firstName: 'John', lastName: 'Doe', age: 30 } }
 *   }, {
 *     Name: 'MappingTemplate',
 *     Value: {
 *       fullName: '{{ user.firstName }} {{ user.lastName }}',
 *       displayName: '{{ user.firstName | upper }}',
 *       ageGroup: '{% if user.age < 18 %}minor{% elif user.age < 65 %}adult{% else %}senior{% endif %}'
 *     }
 *   }]
 * });
 * 
 * // Array transformation
 * await runAction({
 *   ActionName: 'Data Mapper',
 *   Params: [{
 *     Name: 'SourceData',
 *     Value: [{ price: 10, qty: 2 }, { price: 20, qty: 1 }]
 *   }, {
 *     Name: 'MappingTemplate',
 *     Value: {
 *       total: '{{ price * qty }}',
 *       formattedPrice: '${{ price | number(2) }}'
 *     }
 *   }, {
 *     Name: 'IterateArrays',
 *     Value: true
 *   }]
 * });
 * 
 * // String template
 * await runAction({
 *   ActionName: 'Data Mapper',
 *   Params: [{
 *     Name: 'SourceData',
 *     Value: { name: 'John', items: ['apple', 'banana'] }
 *   }, {
 *     Name: 'MappingTemplate',
 *     Value: 'Hello {{ name }}, you have {{ items | length }} items: {{ items | join(", ") }}'
 *   }, {
 *     Name: 'TemplateType',
 *     Value: 'string'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Data Mapper")
export class DataMapperAction extends BaseAction {
    private nunjucksEnv: nunjucks.Environment;

    constructor() {
        super();
        // Initialize Nunjucks with custom filters
        this.nunjucksEnv = new nunjucks.Environment();
        this.removeFunctionGlobals(this.nunjucksEnv);
        this.setupCustomFilters();
    }

    /**
     * Removes nunjucks' built-in function globals (`range`, `cycler`, `joiner`, `lipsum`).
     * They are callable objects whose properties are a path from template code to JavaScript
     * internals, and data mapping has no use for any of them.
     */
    private removeFunctionGlobals(env: nunjucks.Environment): void {
        for (const name of ['range', 'cycler', 'joiner', 'lipsum']) {
            env.addGlobal(name, undefined);
        }
    }

    /**
     * Setup custom Nunjucks filters
     */
    private setupCustomFilters(): void {
        this.setupCustomFiltersOnEnvironment(this.nunjucksEnv);
    }

    /**
     * Transform data using Nunjucks templates
     * 
     * @param params - The action parameters containing:
     *   - SourceData: Input object or array to transform
     *   - MappingTemplate: Nunjucks template string or object with templates
     *   - TemplateType: "string" | "object" (default: "object")
     *   - IterateArrays: Boolean - if true, map each array item (default: false)
     *   - CustomFilters: Object with custom Nunjucks filters (optional)
     *   - StrictVariables: Boolean - throw error on undefined variables (default: false)
     * 
     * @returns Transformed data based on templates
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            let sourceData: any;
            let mappingTemplate: any;
            
            try {
                sourceData = JSONParamHelper.getRequiredJSONParam(params, 'SourceData');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            try {
                mappingTemplate = JSONParamHelper.getRequiredJSONParam(params, 'MappingTemplate');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const templateTypeParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'templatetype');
            const iterateArraysParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'iteratearrays');
            const customFiltersParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'customfilters');
            const strictVariablesParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'strictvariables');

            // Get other parameters
            const templateType = (templateTypeParam?.Value?.toString() || 'object').toLowerCase();
            const iterateArrays = iterateArraysParam?.Value?.toString()?.toLowerCase() === 'true';
            const strictVariables = strictVariablesParam?.Value?.toString()?.toLowerCase() === 'true';

            // Configure Nunjucks environment for strict variables if needed
            let activeEnv = this.nunjucksEnv;
            if (strictVariables) {
                // Create a new environment with strict settings
                activeEnv = new nunjucks.Environment(undefined, { throwOnUndefined: true });
                this.removeFunctionGlobals(activeEnv);
                // Copy filters from the main environment
                this.copyFiltersToEnvironment(activeEnv);
            }

            // Add custom filters if provided
            const customFilters = JSONParamHelper.getJSONParam(params, 'CustomFilters');
            if (customFilters) {
                for (const [name, filterFunc] of Object.entries(customFilters)) {
                    if (typeof filterFunc === 'function') {
                        activeEnv.addFilter(name, filterFunc as (...args: any[]) => any);
                    }
                }
            }

            // Perform transformation
            let result: any;
            
            if (iterateArrays && Array.isArray(sourceData)) {
                // Transform each array item
                result = sourceData.map(item => this.transformData(item, mappingTemplate, templateType, activeEnv));
            } else {
                // Transform single item
                result = this.transformData(sourceData, mappingTemplate, templateType, activeEnv);
            }

            // Prepare output
            const output = {
                result: result,
                sourceType: Array.isArray(sourceData) ? 'array' : typeof sourceData,
                resultType: Array.isArray(result) ? 'array' : typeof result,
                templateType: templateType,
                itemsProcessed: Array.isArray(sourceData) && iterateArrays ? sourceData.length : 1
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(output, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to map data: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Copy filters from main environment to a new environment
     */
    private copyFiltersToEnvironment(targetEnv: nunjucks.Environment): void {
        // Set up the same custom filters on the target environment
        this.setupCustomFiltersOnEnvironment(targetEnv);
    }

    /**
     * Setup custom Nunjucks filters on a specific environment
     */
    private setupCustomFiltersOnEnvironment(env: nunjucks.Environment): void {
        // Number formatting filter
        env.addFilter('number', (value: any, decimals: number = 2) => {
            const num = Number(value);
            return isNaN(num) ? value : num.toFixed(decimals);
        });

        // Currency formatting filter
        env.addFilter('currency', (value: any, symbol: string = '$', decimals: number = 2) => {
            const num = Number(value);
            return isNaN(num) ? value : `${symbol}${num.toFixed(decimals)}`;
        });

        // Date formatting filter (basic)
        env.addFilter('date', (value: any, format: string = 'YYYY-MM-DD') => {
            const date = new Date(value);
            if (isNaN(date.getTime())) return value;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            
            return format
                .replace('YYYY', String(year))
                .replace('MM', month)
                .replace('DD', day)
                .replace('HH', hours)
                .replace('mm', minutes)
                .replace('ss', seconds);
        });

        // JSON stringify filter
        env.addFilter('json', (value: any, indent: number = 0) => {
            return JSON.stringify(value, null, indent);
        });

        // Default value filter
        env.addFilter('default', (value: any, defaultValue: any) => {
            return value === null || value === undefined || value === '' ? defaultValue : value;
        });

        // Truncate filter
        env.addFilter('truncate', (value: string, length: number = 50, suffix: string = '...') => {
            if (!value || value.length <= length) return value;
            return value.substring(0, length - suffix.length) + suffix;
        });

        // Slugify filter
        env.addFilter('slugify', (value: string) => {
            if (!value) return '';
            return value
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        });
    }

    /**
     * SSTI defense: the mapping template is CALLER-supplied (including by AI agents via tool
     * calls), and full Nunjucks is not a sandbox — template code that reaches a function
     * constructor executes arbitrary JavaScript inside the server process. Data mapping needs
     * only property paths, filters and basic control flow, so templates that try to reach
     * JavaScript internals are refused outright:
     * - `constructor` / `__proto__` / `prototype` are the escape hatches from any context object
     *   (checked across the whole template so split-expression tricks cannot hide them)
     * - computed, non-numeric bracket access (`x["..."]`) can smuggle those same names as
     *   built strings (checked inside expressions; static text may still contain brackets)
     * - include/import/extends pull in external templates this action never needs
     */
    private static readonly UNSAFE_EXPRESSION_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
        { pattern: /\[(?!\s*\d+\s*\])/, reason: 'computed bracket member access (use dot paths or numeric indexes)' },
        { pattern: /\{%-?\s*(include|import|extends|from)\b/i, reason: 'external template loading' }
    ];

    private assertTemplateSafe(template: string): void {
        if (/\b(constructor|__proto__|prototype)\b/.test(template)) {
            throw new Error('Mapping template rejected: access to JavaScript object internals (constructor/__proto__/prototype) is not allowed in Data Mapper templates');
        }
        const expressions = template.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g) ?? [];
        for (const expr of expressions) {
            for (const { pattern, reason } of DataMapperAction.UNSAFE_EXPRESSION_PATTERNS) {
                if (pattern.test(expr)) {
                    throw new Error(`Mapping template rejected: ${reason} is not allowed in Data Mapper templates`);
                }
            }
        }
    }

    /** Single choke point for rendering caller-supplied template strings — validates first. */
    private renderTemplate(env: nunjucks.Environment, template: string, data: unknown): string {
        this.assertTemplateSafe(template);
        return env.renderString(template, data);
    }

    /**
     * Transform a single data item using templates
     */
    private transformData(data: any, template: any, templateType: string, env: nunjucks.Environment = this.nunjucksEnv): any {
        try {
            if (templateType === 'string') {
                // Render string template
                return this.renderTemplate(env, template.toString(), data);
            } else if (templateType === 'object' && typeof template === 'object' && !Array.isArray(template)) {
                // Transform object template
                const result: any = {};
                
                for (const [key, templateValue] of Object.entries(template)) {
                    if (typeof templateValue === 'string') {
                        // Render template string
                        result[key] = this.renderTemplate(env, templateValue, data);
                        
                        // Try to parse as JSON if it looks like JSON
                        if (typeof result[key] === 'string' && 
                            (result[key].startsWith('{') || result[key].startsWith('['))) {
                            try {
                                result[key] = JSON.parse(result[key]);
                            } catch (e) {
                                // Keep as string if not valid JSON
                            }
                        }
                    } else if (typeof templateValue === 'object') {
                        // Recursively transform nested objects
                        result[key] = this.transformData(data, templateValue, 'object', env);
                    } else {
                        // Copy non-string values as-is
                        result[key] = templateValue;
                    }
                }
                
                return result;
            } else if (Array.isArray(template)) {
                // Transform array template
                return template.map(item => {
                    if (typeof item === 'string') {
                        return this.renderTemplate(env, item, data);
                    } else if (typeof item === 'object') {
                        return this.transformData(data, item, 'object', env);
                    } else {
                        return item;
                    }
                });
            } else {
                // Return template as-is if not a recognized type
                return template;
            }
        } catch (error) {
            throw new Error(`Template rendering error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}