import { RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import * as d3Scale from 'd3-scale';
import * as d3Shape from 'd3-shape';
import { SVGActionResult, ViewBox, Branding } from './shared/svg-types';
import { SVGUtils } from './shared/svg-utils';
import { getPalette, generateCSS, getFontSpec, getColorForIndex } from './shared/svg-theming';

/**
 * Chart data point interface
 */
interface ChartDataPoint {
    /** Label or category name */
    label?: string;
    /** X-axis value */
    x?: number | string;
    /** Y-axis value */
    y?: number;
    /** Value (for pie charts or single-value points) */
    value?: number;
    /** Optional category for grouping/coloring */
    category?: string;
}

/**
 * Action that generates SVG charts from data using D3.
 * Supports bar, line, pie, scatter, and area charts.
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
 *       { label: 'A', value: 28 },
 *       { label: 'B', value: 55 },
 *       { label: 'C', value: 43 }
 *     ]) },
 *     { Name: 'Title', Value: 'Sample Bar Chart' }
 *   ]
 * });
 *
 * // Line chart with X/Y data
 * await runAction({
 *   ActionName: 'Create SVG Chart',
 *   Params: [
 *     { Name: 'ChartType', Value: 'line' },
 *     { Name: 'Data', Value: JSON.stringify([
 *       { x: 1, y: 10 },
 *       { x: 2, y: 25 },
 *       { x: 3, y: 15 }
 *     ]) }
 *   ]
 * });
 *
 * // Pie chart
 * await runAction({
 *   ActionName: 'Create SVG Chart',
 *   Params: [
 *     { Name: 'ChartType', Value: 'pie' },
 *     { Name: 'Data', Value: JSON.stringify([
 *       { label: 'LLM', value: 67 },
 *       { label: 'Embeddings', value: 10 }
 *     ]) }
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
     *   - ChartType: Type of chart (bar, line, pie, scatter, area)
     *   - Data: JSON array of data objects
     *   - Title: Chart title (optional)
     *   - XAxisLabel: X-axis label (optional)
     *   - YAxisLabel: Y-axis label (optional)
     *   - Width: Chart width in pixels (optional, default: 800)
     *   - Height: Chart height in pixels (optional, default: 600)
     *   - Palette: Color palette name (optional, default: 'mjDefault')
     *   - ShowGrid: Show grid lines (optional, default: false)
     *   - ShowLegend: Show legend (optional, default: false)
     *
     * @returns A promise resolving to an ActionResultSimple with:
     *   - Success: true if chart was generated successfully
     *   - ResultCode: "SUCCESS" or error code
     *   - Message: The SVG string or error message
     */
    protected async InternalRunAction(params: RunActionParams): Promise<SVGActionResult> {
        try {
            // Extract chart type
            const chartTypeParam = this.getParamValue(params, 'ChartType');
            if (!chartTypeParam) {
                return {
                    Success: false,
                    Message: "ChartType parameter is required (bar, line, pie, scatter, area)",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const chartType = this.ensureString(chartTypeParam, 'ChartType').toLowerCase();
            const validTypes = ['bar', 'line', 'pie', 'scatter', 'area'];
            if (!validTypes.includes(chartType)) {
                return {
                    Success: false,
                    Message: `Invalid ChartType: ${chartType}. Valid types: ${validTypes.join(', ')}`,
                    ResultCode: "INVALID_CHART_TYPE"
                };
            }

            // Extract data
            const dataParam = this.getParamValue(params, 'Data');
            if (!dataParam) {
                return {
                    Success: false,
                    Message: "Data parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const data = this.parseJSON<ChartDataPoint[]>(dataParam, 'Data');
            if (!Array.isArray(data) || data.length === 0) {
                return {
                    Success: false,
                    Message: "Data must be a non-empty JSON array",
                    ResultCode: "INVALID_DATA"
                };
            }

            // Parse common parameters
            const width = parseInt(this.ensureString(this.getParamValue(params, 'Width') || '800', 'Width'));
            const height = parseInt(this.ensureString(this.getParamValue(params, 'Height') || '600', 'Height'));
            const title = this.ensureString(this.getParamValue(params, 'Title') || '', 'Title');
            const xAxisLabel = this.ensureString(this.getParamValue(params, 'XAxisLabel') || '', 'XAxisLabel');
            const yAxisLabel = this.ensureString(this.getParamValue(params, 'YAxisLabel') || '', 'YAxisLabel');
            const paletteName = this.ensureString(this.getParamValue(params, 'Palette') || 'mjDefault', 'Palette');

            const showGridParam = this.getParamValue(params, 'ShowGrid');
            const showGrid = showGridParam ? this.ensureString(showGridParam, 'ShowGrid').toLowerCase() === 'true' : false;

            const showLegendParam = this.getParamValue(params, 'ShowLegend');
            const showLegend = showLegendParam ? this.ensureString(showLegendParam, 'ShowLegend').toLowerCase() === 'true' : false;

            // Create branding configuration
            const branding: Branding = {
                palette: { type: 'named', name: paletteName as any }
            };

            // Create viewBox configuration
            const viewBox: ViewBox = {
                width,
                height,
                padding: { top: title ? 60 : 40, right: 40, bottom: xAxisLabel ? 80 : 60, left: yAxisLabel ? 80 : 60 }
            };

            // Generate chart based on type
            let svg: string;
            switch (chartType) {
                case 'bar':
                    svg = await this.renderBarChart(data, viewBox, branding, title, xAxisLabel, yAxisLabel, showGrid, showLegend);
                    break;
                case 'line':
                    svg = await this.renderLineChart(data, viewBox, branding, title, xAxisLabel, yAxisLabel, showGrid, showLegend);
                    break;
                case 'area':
                    svg = await this.renderAreaChart(data, viewBox, branding, title, xAxisLabel, yAxisLabel, showGrid, showLegend);
                    break;
                case 'pie':
                    svg = await this.renderPieChart(data, viewBox, branding, title, showLegend);
                    break;
                case 'scatter':
                    svg = await this.renderScatterChart(data, viewBox, branding, title, xAxisLabel, yAxisLabel, showGrid, showLegend);
                    break;
                default:
                    return {
                        Success: false,
                        Message: `Unsupported chart type: ${chartType}`,
                        ResultCode: "INVALID_CHART_TYPE"
                    };
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: svg,
                svg,
                width,
                height
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
     * Renders a bar chart
     */
    private async renderBarChart(
        data: ChartDataPoint[],
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        xAxisLabel: string,
        yAxisLabel: string,
        showGrid: boolean,
        _showLegend: boolean
    ): Promise<string> {
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'bar-chart');
        const svg = doc.querySelector('svg')!;
        const ns = svg.namespaceURI!;

        // Add accessibility and styles
        if (title) {
            SVGUtils.addA11y(svg, { title, ariaRole: 'img' });
        }
        SVGUtils.addStyles(svg, generateCSS(branding));

        const palette = getPalette(branding.palette);
        const font = getFontSpec(branding.font);

        // Extract labels and values
        const labels = data.map(d => d.label || String(d.x || ''));
        const values = data.map(d => d.value || d.y || 0);
        const maxValue = Math.max(...values);
        const minValue = Math.min(0, Math.min(...values)); // Include 0 in scale

        // Create scales
        const xScale = d3Scale.scaleBand()
            .domain(labels)
            .range([vb.x, vb.x + vb.contentWidth])
            .padding(0.2);

        const yScale = d3Scale.scaleLinear()
            .domain([minValue, maxValue])
            .range([vb.y + vb.contentHeight, vb.y])
            .nice();

        // Create chart group
        const chartGroup = doc.createElementNS(ns, 'g');
        chartGroup.setAttribute('id', 'chart-content');
        svg.appendChild(chartGroup);

        // Draw grid if requested
        if (showGrid) {
            this.drawGrid(doc, chartGroup, xScale, yScale, vb, palette, 'vertical');
        }

        // Draw bars
        data.forEach((d, i) => {
            const value = d.value || d.y || 0;
            const label = d.label || String(d.x || '');
            const x = xScale(label)!;
            const barWidth = xScale.bandwidth();
            const barHeight = Math.abs(yScale(value) - yScale(0));
            const y = value >= 0 ? yScale(value) : yScale(0);

            const rect = doc.createElementNS(ns, 'rect');
            rect.setAttribute('x', String(x));
            rect.setAttribute('y', String(y));
            rect.setAttribute('width', String(barWidth));
            rect.setAttribute('height', String(barHeight));
            rect.setAttribute('fill', getColorForIndex(i, branding.palette));
            rect.setAttribute('stroke', 'none');
            rect.setAttribute('rx', '2');

            chartGroup.appendChild(rect);

            // Add value label on top of bar
            const valueText = doc.createElementNS(ns, 'text');
            valueText.setAttribute('x', String(x + barWidth / 2));
            valueText.setAttribute('y', String(y - 5));
            valueText.setAttribute('text-anchor', 'middle');
            valueText.setAttribute('font-family', font.family);
            valueText.setAttribute('font-size', String(font.size - 2));
            valueText.setAttribute('fill', palette.foreground);
            valueText.textContent = String(Math.round(value * 100) / 100);
            chartGroup.appendChild(valueText);
        });

        // Draw axes
        this.drawXAxis(doc, svg, xScale, vb, palette, font, xAxisLabel);
        this.drawYAxis(doc, svg, yScale, vb, palette, font, yAxisLabel);

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, viewBox.width, font);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a line chart
     */
    private async renderLineChart(
        data: ChartDataPoint[],
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        xAxisLabel: string,
        yAxisLabel: string,
        showGrid: boolean,
        _showLegend: boolean
    ): Promise<string> {
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'line-chart');
        const svg = doc.querySelector('svg')!;
        const ns = svg.namespaceURI!;

        // Add accessibility and styles
        if (title) {
            SVGUtils.addA11y(svg, { title, ariaRole: 'img' });
        }
        SVGUtils.addStyles(svg, generateCSS(branding));

        const palette = getPalette(branding.palette);
        const font = getFontSpec(branding.font);

        // Extract x and y values
        const xValues = data.map(d => typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0)));
        const yValues = data.map(d => d.y || d.value || 0);

        // Create scales
        const xScale = d3Scale.scaleLinear()
            .domain([Math.min(...xValues), Math.max(...xValues)])
            .range([vb.x, vb.x + vb.contentWidth])
            .nice();

        const yScale = d3Scale.scaleLinear()
            .domain([Math.min(...yValues), Math.max(...yValues)])
            .range([vb.y + vb.contentHeight, vb.y])
            .nice();

        // Create chart group
        const chartGroup = doc.createElementNS(ns, 'g');
        chartGroup.setAttribute('id', 'chart-content');
        svg.appendChild(chartGroup);

        // Draw grid if requested
        if (showGrid) {
            this.drawGrid(doc, chartGroup, xScale, yScale, vb, palette, 'both');
        }

        // Create line generator
        const lineGenerator = d3Shape.line<ChartDataPoint>()
            .x(d => xScale(typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0))))
            .y(d => yScale(d.y || d.value || 0));

        // Draw line
        const linePath = doc.createElementNS(ns, 'path');
        linePath.setAttribute('d', lineGenerator(data) || '');
        linePath.setAttribute('fill', 'none');
        linePath.setAttribute('stroke', getColorForIndex(0, branding.palette));
        linePath.setAttribute('stroke-width', '3');
        linePath.setAttribute('stroke-linecap', 'round');
        linePath.setAttribute('stroke-linejoin', 'round');
        chartGroup.appendChild(linePath);

        // Draw data points
        data.forEach((d) => {
            const xVal = typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0));
            const yVal = d.y || d.value || 0;

            const circle = doc.createElementNS(ns, 'circle');
            circle.setAttribute('cx', String(xScale(xVal)));
            circle.setAttribute('cy', String(yScale(yVal)));
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', getColorForIndex(0, branding.palette));
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '2');
            chartGroup.appendChild(circle);
        });

        // Draw axes
        this.drawXAxisNumeric(doc, svg, xScale, vb, palette, font, xAxisLabel);
        this.drawYAxis(doc, svg, yScale, vb, palette, font, yAxisLabel);

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, viewBox.width, font);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders an area chart
     */
    private async renderAreaChart(
        data: ChartDataPoint[],
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        xAxisLabel: string,
        yAxisLabel: string,
        showGrid: boolean,
        _showLegend: boolean
    ): Promise<string> {
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'area-chart');
        const svg = doc.querySelector('svg')!;
        const ns = svg.namespaceURI!;

        // Add accessibility and styles
        if (title) {
            SVGUtils.addA11y(svg, { title, ariaRole: 'img' });
        }
        SVGUtils.addStyles(svg, generateCSS(branding));

        const palette = getPalette(branding.palette);
        const font = getFontSpec(branding.font);

        // Extract x and y values
        const xValues = data.map(d => typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0)));
        const yValues = data.map(d => d.y || d.value || 0);

        // Create scales
        const xScale = d3Scale.scaleLinear()
            .domain([Math.min(...xValues), Math.max(...xValues)])
            .range([vb.x, vb.x + vb.contentWidth])
            .nice();

        const yScale = d3Scale.scaleLinear()
            .domain([0, Math.max(...yValues)]) // Start from 0 for area charts
            .range([vb.y + vb.contentHeight, vb.y])
            .nice();

        // Create chart group
        const chartGroup = doc.createElementNS(ns, 'g');
        chartGroup.setAttribute('id', 'chart-content');
        svg.appendChild(chartGroup);

        // Draw grid if requested
        if (showGrid) {
            this.drawGrid(doc, chartGroup, xScale, yScale, vb, palette, 'both');
        }

        // Create area generator
        const areaGenerator = d3Shape.area<ChartDataPoint>()
            .x(d => xScale(typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0))))
            .y0(yScale(0))
            .y1(d => yScale(d.y || d.value || 0));

        // Draw area
        const areaPath = doc.createElementNS(ns, 'path');
        areaPath.setAttribute('d', areaGenerator(data) || '');
        const areaColor = getColorForIndex(0, branding.palette);
        areaPath.setAttribute('fill', areaColor);
        areaPath.setAttribute('fill-opacity', '0.3');
        areaPath.setAttribute('stroke', 'none');
        chartGroup.appendChild(areaPath);

        // Draw line on top
        const lineGenerator = d3Shape.line<ChartDataPoint>()
            .x(d => xScale(typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0))))
            .y(d => yScale(d.y || d.value || 0));

        const linePath = doc.createElementNS(ns, 'path');
        linePath.setAttribute('d', lineGenerator(data) || '');
        linePath.setAttribute('fill', 'none');
        linePath.setAttribute('stroke', areaColor);
        linePath.setAttribute('stroke-width', '2');
        chartGroup.appendChild(linePath);

        // Draw axes
        this.drawXAxisNumeric(doc, svg, xScale, vb, palette, font, xAxisLabel);
        this.drawYAxis(doc, svg, yScale, vb, palette, font, yAxisLabel);

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, viewBox.width, font);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a pie chart
     */
    private async renderPieChart(
        data: ChartDataPoint[],
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        showLegend: boolean
    ): Promise<string> {
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'pie-chart');
        const svg = doc.querySelector('svg')!;
        const ns = svg.namespaceURI!;

        // Add accessibility and styles
        if (title) {
            SVGUtils.addA11y(svg, { title, ariaRole: 'img' });
        }
        SVGUtils.addStyles(svg, generateCSS(branding));

        const font = getFontSpec(branding.font);

        // Calculate center and radius
        const centerX = vb.x + vb.contentWidth / 2;
        const centerY = vb.y + vb.contentHeight / 2;
        const radius = Math.min(vb.contentWidth, vb.contentHeight) / 2 - 20;

        // Create pie layout
        const pieGenerator = d3Shape.pie<ChartDataPoint>()
            .value(d => d.value || 0)
            .sort(null);

        const arcGenerator = d3Shape.arc<d3Shape.PieArcDatum<ChartDataPoint>>()
            .innerRadius(0)
            .outerRadius(radius);

        const labelArcGenerator = d3Shape.arc<d3Shape.PieArcDatum<ChartDataPoint>>()
            .innerRadius(radius * 0.6)
            .outerRadius(radius * 0.6);

        // Create chart group
        const chartGroup = doc.createElementNS(ns, 'g');
        chartGroup.setAttribute('transform', `translate(${centerX}, ${centerY})`);
        svg.appendChild(chartGroup);

        // Generate pie slices
        const arcs = pieGenerator(data);
        const total = data.reduce((sum, d) => sum + (d.value || 0), 0);

        arcs.forEach((arc, i) => {
            // Draw slice
            const path = doc.createElementNS(ns, 'path');
            path.setAttribute('d', arcGenerator(arc) || '');
            path.setAttribute('fill', getColorForIndex(i, branding.palette));
            path.setAttribute('stroke', '#fff');
            path.setAttribute('stroke-width', '2');
            chartGroup.appendChild(path);

            // Add percentage label if slice is large enough
            const percentage = ((arc.data.value || 0) / total) * 100;
            if (percentage > 5) {
                const centroid = labelArcGenerator.centroid(arc);
                const text = doc.createElementNS(ns, 'text');
                text.setAttribute('x', String(centroid[0]));
                text.setAttribute('y', String(centroid[1]));
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('font-family', font.family);
                text.setAttribute('font-size', String(font.size));
                text.setAttribute('font-weight', 'bold');
                text.setAttribute('fill', '#fff');
                text.textContent = `${Math.round(percentage)}%`;
                chartGroup.appendChild(text);
            }
        });

        // Add legend if requested
        if (showLegend) {
            this.addLegend(doc, svg, data, branding, vb, font);
        }

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, viewBox.width, font);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Renders a scatter plot
     */
    private async renderScatterChart(
        data: ChartDataPoint[],
        viewBox: ViewBox,
        branding: Branding,
        title: string,
        xAxisLabel: string,
        yAxisLabel: string,
        showGrid: boolean,
        _showLegend: boolean
    ): Promise<string> {
        const vb = SVGUtils.calculateViewBox(viewBox);
        const doc = SVGUtils.createSVG(viewBox.width, viewBox.height, 'scatter-chart');
        const svg = doc.querySelector('svg')!;
        const ns = svg.namespaceURI!;

        // Add accessibility and styles
        if (title) {
            SVGUtils.addA11y(svg, { title, ariaRole: 'img' });
        }
        SVGUtils.addStyles(svg, generateCSS(branding));

        const palette = getPalette(branding.palette);
        const font = getFontSpec(branding.font);

        // Extract x and y values
        const xValues = data.map(d => typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0)));
        const yValues = data.map(d => d.y || d.value || 0);

        // Create scales
        const xScale = d3Scale.scaleLinear()
            .domain([Math.min(...xValues), Math.max(...xValues)])
            .range([vb.x, vb.x + vb.contentWidth])
            .nice();

        const yScale = d3Scale.scaleLinear()
            .domain([Math.min(...yValues), Math.max(...yValues)])
            .range([vb.y + vb.contentHeight, vb.y])
            .nice();

        // Create chart group
        const chartGroup = doc.createElementNS(ns, 'g');
        chartGroup.setAttribute('id', 'chart-content');
        svg.appendChild(chartGroup);

        // Draw grid if requested
        if (showGrid) {
            this.drawGrid(doc, chartGroup, xScale, yScale, vb, palette, 'both');
        }

        // Draw scatter points
        data.forEach((d, i) => {
            const xVal = typeof d.x === 'number' ? d.x : parseFloat(String(d.x || 0));
            const yVal = d.y || d.value || 0;

            const circle = doc.createElementNS(ns, 'circle');
            circle.setAttribute('cx', String(xScale(xVal)));
            circle.setAttribute('cy', String(yScale(yVal)));
            circle.setAttribute('r', '6');
            circle.setAttribute('fill', getColorForIndex(i, branding.palette));
            circle.setAttribute('fill-opacity', '0.7');
            circle.setAttribute('stroke', getColorForIndex(i, branding.palette));
            circle.setAttribute('stroke-width', '2');
            chartGroup.appendChild(circle);
        });

        // Draw axes
        this.drawXAxisNumeric(doc, svg, xScale, vb, palette, font, xAxisLabel);
        this.drawYAxis(doc, svg, yScale, vb, palette, font, yAxisLabel);

        // Add title
        if (title) {
            this.addTitle(doc, svg, title, viewBox.width, font);
        }

        return SVGUtils.sanitizeSVG(svg.outerHTML);
    }

    /**
     * Draws grid lines
     */
    private drawGrid(
        doc: Document,
        container: Element,
        xScale: any,
        yScale: d3Scale.ScaleLinear<number, number>,
        vb: ReturnType<typeof SVGUtils.calculateViewBox>,
        palette: ReturnType<typeof getPalette>,
        direction: 'horizontal' | 'vertical' | 'both'
    ): void {
        const ns = container.namespaceURI!;
        const gridGroup = doc.createElementNS(ns, 'g');
        gridGroup.setAttribute('class', 'grid');
        container.appendChild(gridGroup);

        // Horizontal grid lines (for Y axis)
        if (direction === 'horizontal' || direction === 'both') {
            const yTicks = yScale.ticks(5);
            yTicks.forEach(tick => {
                const line = doc.createElementNS(ns, 'line');
                line.setAttribute('x1', String(vb.x));
                line.setAttribute('y1', String(yScale(tick)));
                line.setAttribute('x2', String(vb.x + vb.contentWidth));
                line.setAttribute('y2', String(yScale(tick)));
                line.setAttribute('stroke', palette.foreground);
                line.setAttribute('stroke-opacity', '0.1');
                line.setAttribute('stroke-dasharray', '2,2');
                gridGroup.appendChild(line);
            });
        }

        // Vertical grid lines (for X axis)
        if (direction === 'vertical' || direction === 'both') {
            if (typeof xScale.ticks === 'function') {
                const xTicks = xScale.ticks(5);
                xTicks.forEach((tick: number) => {
                    const line = doc.createElementNS(ns, 'line');
                    line.setAttribute('x1', String(xScale(tick)));
                    line.setAttribute('y1', String(vb.y));
                    line.setAttribute('x2', String(xScale(tick)));
                    line.setAttribute('y2', String(vb.y + vb.contentHeight));
                    line.setAttribute('stroke', palette.foreground);
                    line.setAttribute('stroke-opacity', '0.1');
                    line.setAttribute('stroke-dasharray', '2,2');
                    gridGroup.appendChild(line);
                });
            }
        }
    }

    /**
     * Draws X-axis for categorical data
     */
    private drawXAxis(
        doc: Document,
        svg: SVGElement,
        xScale: d3Scale.ScaleBand<string>,
        vb: ReturnType<typeof SVGUtils.calculateViewBox>,
        palette: ReturnType<typeof getPalette>,
        font: Required<import('./shared/svg-types').FontSpec>,
        label: string
    ): void {
        const ns = svg.namespaceURI!;
        const axisGroup = doc.createElementNS(ns, 'g');
        axisGroup.setAttribute('class', 'x-axis');
        svg.appendChild(axisGroup);

        // Draw axis line
        const axisLine = doc.createElementNS(ns, 'line');
        axisLine.setAttribute('x1', String(vb.x));
        axisLine.setAttribute('y1', String(vb.y + vb.contentHeight));
        axisLine.setAttribute('x2', String(vb.x + vb.contentWidth));
        axisLine.setAttribute('y2', String(vb.y + vb.contentHeight));
        axisLine.setAttribute('stroke', palette.foreground);
        axisLine.setAttribute('stroke-width', '2');
        axisGroup.appendChild(axisLine);

        // Draw labels
        xScale.domain().forEach(label => {
            const x = xScale(label)! + xScale.bandwidth() / 2;
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', String(x));
            text.setAttribute('y', String(vb.y + vb.contentHeight + 20));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-family', font.family);
            text.setAttribute('font-size', String(font.size));
            text.setAttribute('fill', palette.foreground);
            text.textContent = label;
            axisGroup.appendChild(text);
        });

        // Add axis label if provided
        if (label) {
            const labelText = doc.createElementNS(ns, 'text');
            labelText.setAttribute('x', String(vb.x + vb.contentWidth / 2));
            labelText.setAttribute('y', String(vb.y + vb.contentHeight + 50));
            labelText.setAttribute('text-anchor', 'middle');
            labelText.setAttribute('font-family', font.family);
            labelText.setAttribute('font-size', String(font.size + 2));
            labelText.setAttribute('font-weight', '600');
            labelText.setAttribute('fill', palette.foreground);
            labelText.textContent = label;
            axisGroup.appendChild(labelText);
        }
    }

    /**
     * Draws X-axis for numeric data
     */
    private drawXAxisNumeric(
        doc: Document,
        svg: SVGElement,
        xScale: d3Scale.ScaleLinear<number, number>,
        vb: ReturnType<typeof SVGUtils.calculateViewBox>,
        palette: ReturnType<typeof getPalette>,
        font: Required<import('./shared/svg-types').FontSpec>,
        label: string
    ): void {
        const ns = svg.namespaceURI!;
        const axisGroup = doc.createElementNS(ns, 'g');
        axisGroup.setAttribute('class', 'x-axis');
        svg.appendChild(axisGroup);

        // Draw axis line
        const axisLine = doc.createElementNS(ns, 'line');
        axisLine.setAttribute('x1', String(vb.x));
        axisLine.setAttribute('y1', String(vb.y + vb.contentHeight));
        axisLine.setAttribute('x2', String(vb.x + vb.contentWidth));
        axisLine.setAttribute('y2', String(vb.y + vb.contentHeight));
        axisLine.setAttribute('stroke', palette.foreground);
        axisLine.setAttribute('stroke-width', '2');
        axisGroup.appendChild(axisLine);

        // Draw ticks and labels
        const ticks = xScale.ticks(5);
        ticks.forEach(tick => {
            const x = xScale(tick);

            // Tick mark
            const tickLine = doc.createElementNS(ns, 'line');
            tickLine.setAttribute('x1', String(x));
            tickLine.setAttribute('y1', String(vb.y + vb.contentHeight));
            tickLine.setAttribute('x2', String(x));
            tickLine.setAttribute('y2', String(vb.y + vb.contentHeight + 5));
            tickLine.setAttribute('stroke', palette.foreground);
            tickLine.setAttribute('stroke-width', '1');
            axisGroup.appendChild(tickLine);

            // Label
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', String(x));
            text.setAttribute('y', String(vb.y + vb.contentHeight + 20));
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-family', font.family);
            text.setAttribute('font-size', String(font.size));
            text.setAttribute('fill', palette.foreground);
            text.textContent = String(Math.round(tick * 100) / 100);
            axisGroup.appendChild(text);
        });

        // Add axis label if provided
        if (label) {
            const labelText = doc.createElementNS(ns, 'text');
            labelText.setAttribute('x', String(vb.x + vb.contentWidth / 2));
            labelText.setAttribute('y', String(vb.y + vb.contentHeight + 50));
            labelText.setAttribute('text-anchor', 'middle');
            labelText.setAttribute('font-family', font.family);
            labelText.setAttribute('font-size', String(font.size + 2));
            labelText.setAttribute('font-weight', '600');
            labelText.setAttribute('fill', palette.foreground);
            labelText.textContent = label;
            axisGroup.appendChild(labelText);
        }
    }

    /**
     * Draws Y-axis
     */
    private drawYAxis(
        doc: Document,
        svg: SVGElement,
        yScale: d3Scale.ScaleLinear<number, number>,
        vb: ReturnType<typeof SVGUtils.calculateViewBox>,
        palette: ReturnType<typeof getPalette>,
        font: Required<import('./shared/svg-types').FontSpec>,
        label: string
    ): void {
        const ns = svg.namespaceURI!;
        const axisGroup = doc.createElementNS(ns, 'g');
        axisGroup.setAttribute('class', 'y-axis');
        svg.appendChild(axisGroup);

        // Draw axis line
        const axisLine = doc.createElementNS(ns, 'line');
        axisLine.setAttribute('x1', String(vb.x));
        axisLine.setAttribute('y1', String(vb.y));
        axisLine.setAttribute('x2', String(vb.x));
        axisLine.setAttribute('y2', String(vb.y + vb.contentHeight));
        axisLine.setAttribute('stroke', palette.foreground);
        axisLine.setAttribute('stroke-width', '2');
        axisGroup.appendChild(axisLine);

        // Draw ticks and labels
        const ticks = yScale.ticks(5);
        ticks.forEach(tick => {
            const y = yScale(tick);

            // Tick mark
            const tickLine = doc.createElementNS(ns, 'line');
            tickLine.setAttribute('x1', String(vb.x - 5));
            tickLine.setAttribute('y1', String(y));
            tickLine.setAttribute('x2', String(vb.x));
            tickLine.setAttribute('y2', String(y));
            tickLine.setAttribute('stroke', palette.foreground);
            tickLine.setAttribute('stroke-width', '1');
            axisGroup.appendChild(tickLine);

            // Label
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', String(vb.x - 10));
            text.setAttribute('y', String(y));
            text.setAttribute('text-anchor', 'end');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-family', font.family);
            text.setAttribute('font-size', String(font.size));
            text.setAttribute('fill', palette.foreground);
            text.textContent = String(Math.round(tick * 100) / 100);
            axisGroup.appendChild(text);
        });

        // Add axis label if provided
        if (label) {
            const labelText = doc.createElementNS(ns, 'text');
            labelText.setAttribute('x', String(vb.x - 50));
            labelText.setAttribute('y', String(vb.y + vb.contentHeight / 2));
            labelText.setAttribute('text-anchor', 'middle');
            labelText.setAttribute('font-family', font.family);
            labelText.setAttribute('font-size', String(font.size + 2));
            labelText.setAttribute('font-weight', '600');
            labelText.setAttribute('fill', palette.foreground);
            labelText.setAttribute('transform', `rotate(-90, ${vb.x - 50}, ${vb.y + vb.contentHeight / 2})`);
            labelText.textContent = label;
            axisGroup.appendChild(labelText);
        }
    }

    /**
     * Adds a title to the chart
     */
    private addTitle(
        doc: Document,
        svg: SVGElement,
        title: string,
        width: number,
        font: Required<import('./shared/svg-types').FontSpec>
    ): void {
        const ns = svg.namespaceURI!;
        const text = doc.createElementNS(ns, 'text');
        text.setAttribute('x', String(width / 2));
        text.setAttribute('y', '30');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-family', font.family);
        text.setAttribute('font-size', String(font.size + 6));
        text.setAttribute('font-weight', 'bold');
        text.textContent = title;
        svg.appendChild(text);
    }

    /**
     * Adds a legend for pie charts
     */
    private addLegend(
        doc: Document,
        svg: SVGElement,
        data: ChartDataPoint[],
        branding: Branding,
        vb: ReturnType<typeof SVGUtils.calculateViewBox>,
        font: Required<import('./shared/svg-types').FontSpec>
    ): void {
        const ns = svg.namespaceURI!;
        const legendGroup = doc.createElementNS(ns, 'g');
        legendGroup.setAttribute('class', 'legend');
        legendGroup.setAttribute('transform', `translate(${vb.x + vb.contentWidth + 20}, ${vb.y})`);
        svg.appendChild(legendGroup);

        data.forEach((d, i) => {
            const g = doc.createElementNS(ns, 'g');
            g.setAttribute('transform', `translate(0, ${i * 25})`);

            // Color box
            const rect = doc.createElementNS(ns, 'rect');
            rect.setAttribute('width', '15');
            rect.setAttribute('height', '15');
            rect.setAttribute('fill', getColorForIndex(i, branding.palette));
            g.appendChild(rect);

            // Label
            const text = doc.createElementNS(ns, 'text');
            text.setAttribute('x', '20');
            text.setAttribute('y', '12');
            text.setAttribute('font-family', font.family);
            text.setAttribute('font-size', String(font.size));
            text.textContent = d.label || `Item ${i + 1}`;
            g.appendChild(text);

            legendGroup.appendChild(g);
        });
    }

    /**
     * Helper to safely parse JSON
     */
    private parseJSON<T>(value: any, paramName: string): T {
        if (typeof value === 'object' && value !== null) {
            return value as T;
        }

        if (typeof value === 'string') {
            try {
                return JSON.parse(value) as T;
            } catch (error) {
                throw new Error(
                    `Parameter '${paramName}' contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }

        throw new Error(
            `Parameter '${paramName}' must be a JSON string or object. Received ${typeof value}.`
        );
    }

    /**
     * Helper to ensure a parameter value is a string
     */
    private ensureString(value: any, paramName: string): string {
        if (value == null) {
            return '';
        }

        if (typeof value === 'string') {
            return value;
        }

        if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        }

        throw new Error(
            `Parameter '${paramName}' must be a string, number, or boolean. ` +
            `Received ${typeof value}. If providing JSON data, ensure it's passed as a string.`
        );
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