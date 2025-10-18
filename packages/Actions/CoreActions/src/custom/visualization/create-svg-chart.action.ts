import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as vega from 'vega';
import * as vegaLite from 'vega-lite';
import { TopLevelSpec as VegaLiteSpec } from 'vega-lite';

/**
 * Action that generates SVG charts from data using Vega-Lite.
 * Supports various chart types including bar, line, pie, scatter, area, and more.
 *
 * This action is designed for AI agents and workflows to create publication-quality
 * visualizations from structured data without writing visualization code.
 *
 * @example
 * ```typescript
 * // Simple bar chart
 * await runAction({
 *   ActionName: 'Create SVG Chart',
 *   Params: [
 *     { Name: 'ChartType', Value: 'bar' },
 *     { Name: 'Data', Value: JSON.stringify([
 *       { category: 'A', value: 28 },
 *       { category: 'B', value: 55 },
 *       { category: 'C', value: 43 }
 *     ]) },
 *     { Name: 'XField', Value: 'category' },
 *     { Name: 'YField', Value: 'value' },
 *     { Name: 'Title', Value: 'Sample Bar Chart' }
 *   ]
 * });
 *
 * // Pie chart
 * await runAction({
 *   ActionName: 'Create SVG Chart',
 *   Params: [
 *     { Name: 'ChartType', Value: 'pie' },
 *     { Name: 'Data', Value: JSON.stringify([
 *       { category: 'LLM', count: 67 },
 *       { category: 'Embeddings', count: 10 }
 *     ]) },
 *     { Name: 'ThetaField', Value: 'count' },
 *     { Name: 'ColorField', Value: 'category' },
 *     { Name: 'Width', Value: '400' },
 *     { Name: 'Height', Value: '300' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__CreateSVGChart")
export class CreateSVGChartAction extends BaseAction {
    /**
     * Generates an SVG chart from the provided data and configuration
     *
     * @param params - The action parameters containing:
     *   - ChartType: Type of chart (bar, line, pie, scatter, area, etc.)
     *   - Data: JSON array of data objects
     *   - XField: Field name for X axis (for bar, line, scatter, area)
     *   - YField: Field name for Y axis (for bar, line, scatter, area)
     *   - ThetaField: Field name for pie slice size (for pie charts)
     *   - ColorField: Field name for color encoding (optional)
     *   - Title: Chart title (optional)
     *   - Width: Chart width in pixels (optional, default: 400)
     *   - Height: Chart height in pixels (optional, default: 300)
     *   - VegaLiteSpec: Full Vega-Lite JSON spec (optional, overrides other params)
     *
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if chart was generated successfully
     *   - ResultCode: "SUCCESS" or error code
     *   - Message: The SVG string or error message
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Check if a full Vega-Lite spec was provided
            const specParam = this.getParamValue(params, 'VegaLiteSpec');

            let vlSpec: VegaLiteSpec;

            if (specParam) {
                // Use the provided spec directly
                vlSpec = JSON.parse(specParam);
            } else {
                // Build spec from individual parameters
                const chartType = this.getParamValue(params, 'ChartType');
                const dataParam = this.getParamValue(params, 'Data');

                if (!chartType) {
                    return {
                        Success: false,
                        Message: "ChartType parameter is required (or provide VegaLiteSpec)",
                        ResultCode: "MISSING_PARAMETERS"
                    };
                }

                if (!dataParam) {
                    return {
                        Success: false,
                        Message: "Data parameter is required (or provide VegaLiteSpec)",
                        ResultCode: "MISSING_PARAMETERS"
                    };
                }

                let data;
                if (typeof dataParam !== 'string') {
                    data = dataParam;
                } else {
                    data = JSON.parse(dataParam);
                }

                if (!Array.isArray(data)) {
                    return {
                        Success: false,
                        Message: "Data parameter must be a JSON array",
                        ResultCode: "INVALID_DATA"
                    };
                }

                // Build the Vega-Lite spec
                vlSpec = this.buildVegaLiteSpec(params, chartType.toLowerCase(), data);
            }

            // Compile Vega-Lite to Vega
            const vegaSpec = vegaLite.compile(vlSpec).spec;

            // Create a headless view and render to SVG
            const view = new vega.View(vega.parse(vegaSpec), { renderer: 'none' });
            const svg = await view.toSVG();

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: svg
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate chart: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "CHART_GENERATION_FAILED"
            };
        }
    }

    /**
     * Builds a Vega-Lite specification from action parameters
     */
    private buildVegaLiteSpec(params: RunActionParams, chartType: string, data: any[]): VegaLiteSpec {
        const title = this.getParamValue(params, 'Title');
        const width = parseInt(this.getParamValue(params, 'Width') || '400');
        const height = parseInt(this.getParamValue(params, 'Height') || '300');

        const baseSpec: any = {
            $schema: "https://vega.github.io/schema/vega-lite/v5.json",
            width,
            height,
            data: { values: data }
        };

        if (title) {
            baseSpec.title = title;
        }

        // Build encoding based on chart type
        switch (chartType) {
            case 'bar':
            case 'line':
            case 'area':
            case 'point':
            case 'scatter':
                baseSpec.mark = chartType === 'scatter' ? 'point' : chartType;
                baseSpec.encoding = this.buildCartesianEncoding(params);
                break;

            case 'pie':
            case 'arc':
                baseSpec.mark = 'arc';
                baseSpec.encoding = this.buildPieEncoding(params);
                break;

            default:
                throw new Error(`Unsupported chart type: ${chartType}. Supported types: bar, line, area, point, scatter, pie`);
        }

        return baseSpec as VegaLiteSpec;
    }

    /**
     * Builds encoding for Cartesian charts (bar, line, scatter, area)
     */
    private buildCartesianEncoding(params: RunActionParams): any {
        const xField = this.getParamValue(params, 'XField');
        const yField = this.getParamValue(params, 'YField');
        const colorField = this.getParamValue(params, 'ColorField');

        if (!xField || !yField) {
            throw new Error("XField and YField are required for this chart type");
        }

        const encoding: any = {
            x: { field: xField, type: this.inferFieldType(xField) },
            y: { field: yField, type: 'quantitative' }
        };

        if (colorField) {
            encoding.color = { field: colorField, type: 'nominal' };
        }

        return encoding;
    }

    /**
     * Builds encoding for pie/arc charts
     */
    private buildPieEncoding(params: RunActionParams): any {
        const thetaField = this.getParamValue(params, 'ThetaField');
        const colorField = this.getParamValue(params, 'ColorField');

        if (!thetaField) {
            throw new Error("ThetaField is required for pie charts");
        }

        const encoding: any = {
            theta: { field: thetaField, type: 'quantitative' }
        };

        if (colorField) {
            encoding.color = { field: colorField, type: 'nominal' };
        }

        return encoding;
    }

    /**
     * Infers the Vega-Lite field type from field name
     */
    private inferFieldType(fieldName: string): 'quantitative' | 'nominal' | 'ordinal' | 'temporal' {
        const lowerName = fieldName.toLowerCase();

        // Temporal hints
        if (lowerName.includes('date') || lowerName.includes('time') || lowerName.includes('year') || lowerName.includes('month')) {
            return 'temporal';
        }

        // Quantitative hints
        if (lowerName.includes('count') || lowerName.includes('value') || lowerName.includes('amount') || lowerName.includes('total')) {
            return 'quantitative';
        }

        // Default to nominal for categorical data
        return 'nominal';
    }

    /**
     * Helper to get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, paramName: string): string | null {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value && typeof param.Value === 'string') {
            return param?.Value?.trim() || null;
        }
        else {
            return param?.Value || null;
        }
    }
}

/**
 * Loader function to ensure the CreateSVGChartAction class is included in the bundle.
 * This prevents tree-shaking from removing the class during the build process.
 */
export function LoadCreateSVGChartAction() {
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}
