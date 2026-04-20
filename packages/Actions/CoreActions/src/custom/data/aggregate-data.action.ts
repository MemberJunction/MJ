import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { JSONParamHelper } from "../utilities/json-param-helper";

/**
 * Action that performs aggregation operations on arrays of data
 * Supports grouping, counting, summing, averaging, and other statistical operations
 * 
 * @example
 * ```typescript
 * // Simple aggregation
 * await runAction({
 *   ActionName: 'Aggregate Data',
 *   Params: [{
 *     Name: 'InputData',
 *     Value: [
 *       { category: 'A', value: 10 },
 *       { category: 'A', value: 20 },
 *       { category: 'B', value: 15 }
 *     ]
 *   }, {
 *     Name: 'Aggregations',
 *     Value: [
 *       { field: 'value', operation: 'sum', outputName: 'totalValue' },
 *       { field: 'value', operation: 'avg', outputName: 'avgValue' }
 *     ]
 *   }]
 * });
 * 
 * // Group by aggregation
 * await runAction({
 *   ActionName: 'Aggregate Data',
 *   Params: [{
 *     Name: 'InputData',
 *     Value: salesData
 *   }, {
 *     Name: 'GroupBy',
 *     Value: ['region', 'product']
 *   }, {
 *     Name: 'Aggregations',
 *     Value: [
 *       { field: 'sales', operation: 'sum', outputName: 'totalSales' },
 *       { field: 'sales', operation: 'count', outputName: 'transactionCount' }
 *     ]
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Aggregate Data")
export class AggregateDataAction extends BaseAction {
    
    /**
     * Performs aggregation operations on data arrays
     * 
     * @param params - The action parameters containing:
     *   - InputData: Array of objects to aggregate
     *   - GroupBy: Field name(s) to group by (string or array, optional)
     *   - Aggregations: Array of aggregation specifications
     *   - IncludeEmptyGroups: Include groups with no data (default: false)
     *   - SortBy: Field to sort results by (optional)
     *   - SortOrder: "asc" | "desc" (default: "asc")
     * 
     * @returns Aggregated results
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            let inputData: any[];
            let aggregations: any[];
            
            try {
                inputData = JSONParamHelper.getRequiredJSONParam(params, 'InputData');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            try {
                aggregations = JSONParamHelper.getRequiredJSONParam(params, 'Aggregations');
            } catch (error) {
                return {
                    Success: false,
                    Message: error instanceof Error ? error.message : String(error),
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const groupByParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'groupby');
            const includeEmptyGroupsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'includeemptygroups');
            const sortByParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'sortby');
            const sortOrderParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'sortorder');

            if (!Array.isArray(inputData)) {
                return {
                    Success: false,
                    Message: "InputData must be an array",
                    ResultCode: "INVALID_INPUT_DATA"
                };
            }

            // Parse group by fields
            let groupByFields: string[] = [];
            if (groupByParam?.Value) {
                if (typeof groupByParam.Value === 'string') {
                    groupByFields = [groupByParam.Value];
                } else if (Array.isArray(groupByParam.Value)) {
                    groupByFields = groupByParam.Value;
                } else {
                    return {
                        Success: false,
                        Message: "GroupBy must be a string or array of strings",
                        ResultCode: "INVALID_GROUP_BY"
                    };
                }
            }


            if (!Array.isArray(aggregations)) {
                return {
                    Success: false,
                    Message: "Aggregations must be an array",
                    ResultCode: "INVALID_AGGREGATIONS"
                };
            }

            // Validate aggregations
            const validOperations = ['sum', 'avg', 'min', 'max', 'count', 'countDistinct', 'first', 'last', 'stdDev', 'variance'];
            for (const agg of aggregations) {
                if (!agg.operation || !validOperations.includes(agg.operation)) {
                    return {
                        Success: false,
                        Message: `Invalid operation: ${agg.operation}. Valid operations are: ${validOperations.join(', ')}`,
                        ResultCode: "INVALID_OPERATION"
                    };
                }
                if (!agg.outputName) {
                    return {
                        Success: false,
                        Message: "Each aggregation must have an outputName",
                        ResultCode: "MISSING_OUTPUT_NAME"
                    };
                }
            }

            // Get other parameters
            const includeEmptyGroups = includeEmptyGroupsParam?.Value?.toString()?.toLowerCase() === 'true';
            const sortBy = sortByParam?.Value?.toString();
            const sortOrder = (sortOrderParam?.Value?.toString() || 'asc').toLowerCase();

            // Perform aggregation
            let result: any;
            if (groupByFields.length > 0) {
                result = this.aggregateWithGrouping(inputData, groupByFields, aggregations, includeEmptyGroups);
            } else {
                result = this.aggregateWithoutGrouping(inputData, aggregations);
            }

            // Sort results if requested
            if (sortBy && Array.isArray(result)) {
                result.sort((a, b) => {
                    const aVal = a[sortBy];
                    const bVal = b[sortBy];
                    
                    if (aVal === bVal) return 0;
                    if (aVal === null || aVal === undefined) return 1;
                    if (bVal === null || bVal === undefined) return -1;
                    
                    const comparison = aVal < bVal ? -1 : 1;
                    return sortOrder === 'asc' ? comparison : -comparison;
                });
            }

            // Prepare output
            const output = {
                result: result,
                rowCount: Array.isArray(result) ? result.length : 1,
                inputRowCount: inputData.length,
                groupBy: groupByFields.length > 0 ? groupByFields : undefined,
                aggregations: aggregations.map(a => ({ 
                    field: a.field, 
                    operation: a.operation, 
                    outputName: a.outputName 
                }))
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(output, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to aggregate data: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Aggregate without grouping (single result)
     */
    private aggregateWithoutGrouping(data: any[], aggregations: any[]): any {
        const result: any = {};
        
        for (const agg of aggregations) {
            result[agg.outputName] = this.calculateAggregation(data, agg);
        }
        
        return result;
    }

    /**
     * Aggregate with grouping (multiple results)
     */
    private aggregateWithGrouping(data: any[], groupByFields: string[], aggregations: any[], includeEmptyGroups: boolean): any[] {
        // Group the data
        const groups = new Map<string, any[]>();
        
        for (const item of data) {
            const key = groupByFields.map(field => item[field] ?? 'null').join('|');
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(item);
        }
        
        // Calculate aggregations for each group
        const results: any[] = [];
        
        for (const [key, groupData] of groups) {
            const result: any = {};
            
            // Add group by values
            const keyParts = key.split('|');
            groupByFields.forEach((field, index) => {
                result[field] = keyParts[index] === 'null' ? null : groupData[0][field];
            });
            
            // Calculate aggregations
            for (const agg of aggregations) {
                result[agg.outputName] = this.calculateAggregation(groupData, agg);
            }
            
            results.push(result);
        }
        
        return results;
    }

    /**
     * Calculate a single aggregation
     */
    private calculateAggregation(data: any[], aggregation: any): any {
        if (data.length === 0) {
            return aggregation.operation === 'count' ? 0 : null;
        }
        
        switch (aggregation.operation) {
            case 'count':
                return data.length;
                
            case 'countDistinct':
                if (!aggregation.field) return data.length;
                const uniqueValues = new Set(data.map(item => item[aggregation.field]));
                return uniqueValues.size;
                
            case 'sum':
                return data.reduce((sum, item) => {
                    const value = this.getNumericValue(item[aggregation.field]);
                    return sum + (value ?? 0);
                }, 0);
                
            case 'avg':
                const total = data.reduce((sum, item) => {
                    const value = this.getNumericValue(item[aggregation.field]);
                    return sum + (value ?? 0);
                }, 0);
                return total / data.length;
                
            case 'min':
                return data.reduce((min, item) => {
                    const value = item[aggregation.field];
                    if (value === null || value === undefined) return min;
                    return min === null || value < min ? value : min;
                }, null);
                
            case 'max':
                return data.reduce((max, item) => {
                    const value = item[aggregation.field];
                    if (value === null || value === undefined) return max;
                    return max === null || value > max ? value : max;
                }, null);
                
            case 'first':
                return data[0][aggregation.field];
                
            case 'last':
                return data[data.length - 1][aggregation.field];
                
            case 'stdDev':
                return this.calculateStandardDeviation(data, aggregation.field);
                
            case 'variance':
                return this.calculateVariance(data, aggregation.field);
                
            default:
                return null;
        }
    }

    /**
     * Get numeric value, handling null/undefined
     */
    private getNumericValue(value: any): number | null {
        if (value === null || value === undefined) return null;
        const num = Number(value);
        return isNaN(num) ? null : num;
    }

    /**
     * Calculate standard deviation
     */
    private calculateStandardDeviation(data: any[], field: string): number | null {
        const variance = this.calculateVariance(data, field);
        return variance === null ? null : Math.sqrt(variance);
    }

    /**
     * Calculate variance
     */
    private calculateVariance(data: any[], field: string): number | null {
        const values = data.map(item => this.getNumericValue(item[field])).filter(v => v !== null) as number[];
        if (values.length === 0) return null;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDifferences = values.map(val => Math.pow(val - mean, 2));
        return squaredDifferences.reduce((sum, val) => sum + val, 0) / values.length;
    }
}