import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as nunjucks from "nunjucks";
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
        this.setupCustomFilters();
    }

    /**
     * Setup custom Nunjucks filters
     */
    private setupCustomFilters(): void {
        // Number formatting filter
        this.nunjucksEnv.addFilter('number', (value: any, decimals: number = 2) => {
            const num = Number(value);
            return isNaN(num) ? value : num.toFixed(decimals);
        });

        // Currency formatting filter
        this.nunjucksEnv.addFilter('currency', (value: any, symbol: string = '$', decimals: number = 2) => {
            const num = Number(value);
            return isNaN(num) ? value : `${symbol}${num.toFixed(decimals)}`;
        });

        // Date formatting filter (basic)
        this.nunjucksEnv.addFilter('date', (value: any, format: string = 'YYYY-MM-DD') => {
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
        this.nunjucksEnv.addFilter('json', (value: any, indent: number = 0) => {
            return JSON.stringify(value, null, indent);
        });

        // Default value filter
        this.nunjucksEnv.addFilter('default', (value: any, defaultValue: any) => {
            return value === null || value === undefined || value === '' ? defaultValue : value;
        });

        // Truncate filter
        this.nunjucksEnv.addFilter('truncate', (value: string, length: number = 50, suffix: string = '...') => {
            if (!value || value.length <= length) return value;
            return value.substring(0, length - suffix.length) + suffix;
        });

        // Slugify filter
        this.nunjucksEnv.addFilter('slugify', (value: string) => {
            if (!value) return '';
            return value
                .toLowerCase()
                .replace(/[^\w\s-]/g, '')
                .replace(/[\s_-]+/g, '-')
                .replace(/^-+|-+$/g, '');
        });
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
            const iterateArrays = iterateArraysParam?.Value?.toString()?.toLowerCase() === 'true' ?? false;
            const strictVariables = strictVariablesParam?.Value?.toString()?.toLowerCase() === 'true' ?? false;

            // Configure Nunjucks environment
            this.nunjucksEnv.opts.throwOnUndefined = strictVariables;

            // Add custom filters if provided
            const customFilters = JSONParamHelper.getJSONParam(params, 'CustomFilters');
            if (customFilters) {
                for (const [name, filterFunc] of Object.entries(customFilters)) {
                    if (typeof filterFunc === 'function') {
                        this.nunjucksEnv.addFilter(name, filterFunc);
                    }
                }
            }

            // Perform transformation
            let result: any;
            
            if (iterateArrays && Array.isArray(sourceData)) {
                // Transform each array item
                result = sourceData.map(item => this.transformData(item, mappingTemplate, templateType));
            } else {
                // Transform single item
                result = this.transformData(sourceData, mappingTemplate, templateType);
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
     * Transform a single data item using templates
     */
    private transformData(data: any, template: any, templateType: string): any {
        try {
            if (templateType === 'string') {
                // Render string template
                return this.nunjucksEnv.renderString(template.toString(), data);
            } else if (templateType === 'object' && typeof template === 'object' && !Array.isArray(template)) {
                // Transform object template
                const result: any = {};
                
                for (const [key, templateValue] of Object.entries(template)) {
                    if (typeof templateValue === 'string') {
                        // Render template string
                        result[key] = this.nunjucksEnv.renderString(templateValue, data);
                        
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
                        result[key] = this.transformData(data, templateValue, 'object');
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
                        return this.nunjucksEnv.renderString(item, data);
                    } else if (typeof item === 'object') {
                        return this.transformData(data, item, 'object');
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

/**
 * Loader function to ensure the DataMapperAction class is included in the bundle
 */
export function LoadDataMapperAction() {
    // Stub function to prevent tree shaking
}