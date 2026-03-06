import { Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import * as d3 from 'd3';

export interface HeatmapData {
  agent: string;
  model: string;
  avgTime: number;
  successRate: number;
  value?: number; // Computed performance score
}

export interface HeatmapConfig {
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  colorScheme?: string[];
  showTooltip?: boolean;
  animationDuration?: number;
}

@Component({
  standalone: false,
  selector: 'app-performance-heatmap',
  template: `
    <div class="performance-heatmap">
      <div class="chart-header">
        <h4 class="chart-title">{{ title || 'Agent vs Model Performance' }}</h4>
        <div class="chart-controls">
          <div class="metric-selector">
            <label>Metric:</label>
            <select [(ngModel)]="selectedMetric" (change)="updateChart()">
              <option value="performance">Performance Score</option>
              <option value="avgTime">Avg Execution Time</option>
              <option value="successRate">Success Rate</option>
            </select>
          </div>
        </div>
      </div>
      
      <div class="chart-container">
        <svg #chartSvg></svg>
        <div class="chart-tooltip" #tooltip style="display: none;"></div>
      </div>
      
      <div class="chart-legend">
        <div class="legend-title">{{ getLegendTitle() }}</div>
        <div class="legend-gradient" #legendGradient></div>
        <div class="legend-labels">
          <span class="legend-min">{{ formatLegendValue(minValue) }}</span>
          <span class="legend-max">{{ formatLegendValue(maxValue) }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .performance-heatmap {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 20px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .chart-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .chart-controls {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .metric-selector {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .metric-selector label {
      color: #666;
      font-weight: 500;
    }

    .metric-selector select {
      padding: 4px 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 11px;
      background: white;
    }

    .chart-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      min-height: 200px;
    }

    .chart-tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 10px 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      z-index: 1000;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      max-width: 250px;
    }

    .chart-legend {
      margin-top: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
    }

    .legend-title {
      color: #666;
      font-weight: 500;
      white-space: nowrap;
    }

    .legend-gradient {
      flex: 1;
      height: 16px;
      border-radius: 8px;
      position: relative;
    }

    .legend-labels {
      display: flex;
      justify-content: space-between;
      min-width: 80px;
      color: #666;
      font-weight: 500;
    }

    /* Chart styles */
    :host ::ng-deep .heatmap-cell {
      stroke: white;
      stroke-width: 1;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    :host ::ng-deep .heatmap-cell:hover {
      stroke: #333;
      stroke-width: 2;
    }

    :host ::ng-deep .axis {
      font-size: 10px;
      color: #666;
    }

    :host ::ng-deep .axis path {
      stroke: #ddd;
    }

    :host ::ng-deep .axis .tick line {
      stroke: #ddd;
    }

    :host ::ng-deep .axis .tick text {
      fill: #666;
    }

    :host ::ng-deep .axis-label {
      font-size: 11px;
      font-weight: 500;
      fill: #333;
    }

    .no-data {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #999;
      gap: 12px;
    }

    .no-data i {
      font-size: 32px;
      color: #ddd;
    }

    @media (max-width: 768px) {
      .chart-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .chart-legend {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      
      .legend-gradient {
        width: 100%;
        max-width: 200px;
      }
    }
  `]
})
export class PerformanceHeatmapComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input() data: HeatmapData[] = [];
  @Input() title?: string;
  @Input() config: HeatmapConfig = {};

  @ViewChild('chartSvg', { static: true }) chartSvg!: ElementRef<SVGElement>;
  @ViewChild('tooltip', { static: true }) tooltip!: ElementRef<HTMLDivElement>;
  @ViewChild('legendGradient', { static: true }) legendGradient!: ElementRef<HTMLDivElement>;

  private svg!: d3.Selection<SVGElement, unknown, null, undefined>;
  private width = 0;
  private height = 0;
  private margin = { top: 40, right: 20, bottom: 60, left: 80 };

  // Chart configuration
  private defaultColorScheme = ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'];
  
  // Data processing
  selectedMetric = 'performance';
  processedData: HeatmapData[] = [];
  uniqueAgents: string[] = [];
  uniqueModels: string[] = [];
  minValue = 0;
  maxValue = 1;

  ngOnInit() {
    this.applyConfig();
  }

  ngAfterViewInit() {
    this.initChart();
    this.processData();
    this.updateChart();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      this.processData();
      this.updateChart();
    }
    if (changes['config'] && !changes['config'].firstChange) {
      this.applyConfig();
      this.updateChart();
    }
  }

  ngOnDestroy() {
    d3.select(window).on('resize.heatmap', null);
  }

  private applyConfig() {
    const config = this.config;
    this.margin = { ...this.margin, ...config.margin };
  }

  private initChart() {
    this.svg = d3.select(this.chartSvg.nativeElement);
    this.initLegend();
    
    // Set up responsive behavior
    d3.select(window).on('resize.heatmap', () => this.updateChart());
  }

  private processData() {
    if (!this.data || this.data.length === 0) {
      this.processedData = [];
      this.uniqueAgents = [];
      this.uniqueModels = [];
      return;
    }

    // Calculate performance scores and process data
    this.processedData = this.data.map(d => ({
      ...d,
      value: this.calculatePerformanceScore(d)
    }));

    // Get unique agents and models
    this.uniqueAgents = Array.from(new Set(this.processedData.map(d => d.agent))).sort();
    this.uniqueModels = Array.from(new Set(this.processedData.map(d => d.model))).sort();

    // Update value range based on selected metric
    this.updateValueRange();
  }

  private calculatePerformanceScore(data: HeatmapData): number {
    // Normalize avgTime (lower is better, scale 0-1)
    const maxTime = Math.max(...this.data.map(d => d.avgTime));
    const normalizedTime = maxTime > 0 ? 1 - (data.avgTime / maxTime) : 1;
    
    // Success rate is already 0-1
    const normalizedSuccess = data.successRate;
    
    // Weighted combination (60% success rate, 40% speed)
    return normalizedSuccess * 0.6 + normalizedTime * 0.4;
  }

  private updateValueRange() {
    let values: number[];
    
    switch (this.selectedMetric) {
      case 'avgTime':
        values = this.processedData.map(d => d.avgTime);
        break;
      case 'successRate':
        values = this.processedData.map(d => d.successRate);
        break;
      case 'performance':
      default:
        values = this.processedData.map(d => d.value || 0);
        break;
    }

    this.minValue = Math.min(...values);
    this.maxValue = Math.max(...values);

    // Ensure reasonable range
    if (this.minValue === this.maxValue) {
      this.maxValue = this.minValue + 1;
    }
  }

  updateChart() {
    if (!this.processedData || this.processedData.length === 0) {
      this.svg.selectAll('*').remove();
      return;
    }

    this.calculateDimensions();
    this.svg.selectAll('*').remove();
    this.drawChart();
    this.updateLegend();
  }

  private calculateDimensions() {
    const container = this.chartSvg.nativeElement.parentElement!;
    this.width = (this.config.width || container.clientWidth) - this.margin.left - this.margin.right;
    this.height = (this.config.height || Math.max(300, this.uniqueAgents.length * 30 + 100)) - this.margin.top - this.margin.bottom;
    
    this.svg
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom);
  }

  private drawChart() {
    const g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Create scales
    const xScale = d3.scaleBand()
      .domain(this.uniqueModels)
      .range([0, this.width])
      .padding(0.05);

    const yScale = d3.scaleBand()
      .domain(this.uniqueAgents)
      .range([0, this.height])
      .padding(0.05);

    const colorScale = d3.scaleSequential()
      .domain([this.minValue, this.maxValue])
      .interpolator(d3.interpolateBlues);

    // Draw cells
    const cells = g.selectAll('.heatmap-cell')
      .data(this.processedData)
      .enter().append('rect')
      .attr('class', 'heatmap-cell')
      .attr('x', d => xScale(d.model) || 0)
      .attr('y', d => yScale(d.agent) || 0)
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .attr('fill', d => colorScale(this.getMetricValue(d)))
      .on('mouseover', (event, d) => this.showTooltip(event, d))
      .on('mouseout', () => this.hideTooltip());

    // Add animation
    if (this.config.animationDuration !== 0) {
      cells
        .attr('opacity', 0)
        .transition()
        .duration(this.config.animationDuration || 500)
        .delay((d, i) => i * 20)
        .attr('opacity', 1);
    }

    // Draw axes
    this.drawAxes(g, xScale, yScale);

    // Add value labels on cells (for smaller datasets)
    if (this.processedData.length <= 50) {
      g.selectAll('.cell-label')
        .data(this.processedData)
        .enter().append('text')
        .attr('class', 'cell-label')
        .attr('x', d => (xScale(d.model) || 0) + xScale.bandwidth() / 2)
        .attr('y', d => (yScale(d.agent) || 0) + yScale.bandwidth() / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', '10px')
        .attr('font-weight', '500')
        .attr('fill', d => this.getTextColor(colorScale(this.getMetricValue(d))))
        .text(d => this.formatCellValue(this.getMetricValue(d)));
    }
  }

  private drawAxes(g: any, xScale: any, yScale: any) {
    // X axis (models)
    g.append('g')
      .attr('class', 'axis axis-x')
      .attr('transform', `translate(0,${this.height})`)
      .call(d3.axisBottom(xScale))
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em')
      .attr('transform', 'rotate(-45)');

    // Y axis (agents)
    g.append('g')
      .attr('class', 'axis axis-y')
      .call(d3.axisLeft(yScale));

    // Axis labels
    g.append('text')
      .attr('class', 'axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - this.margin.left)
      .attr('x', 0 - (this.height / 2))
      .attr('dy', '1em')
      .style('text-anchor', 'middle')
      .text('MJ: AI Agents');

    g.append('text')
      .attr('class', 'axis-label')
      .attr('transform', `translate(${this.width / 2}, ${this.height + this.margin.bottom - 10})`)
      .style('text-anchor', 'middle')
      .text('MJ: AI Models');
  }

  private getMetricValue(data: HeatmapData): number {
    switch (this.selectedMetric) {
      case 'avgTime':
        return data.avgTime;
      case 'successRate':
        return data.successRate;
      case 'performance':
      default:
        return data.value || 0;
    }
  }

  private getTextColor(backgroundColor: string): string {
    // Convert color to RGB and calculate luminance
    const rgb = d3.rgb(backgroundColor);
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#333' : '#fff';
  }

  private formatCellValue(value: number): string {
    switch (this.selectedMetric) {
      case 'avgTime':
        return `${(value / 1000).toFixed(1)}s`;
      case 'successRate':
        return `${(value * 100).toFixed(0)}%`;
      case 'performance':
      default:
        return value.toFixed(2);
    }
  }

  private showTooltip(event: MouseEvent, data: HeatmapData) {
    const tooltip = d3.select(this.tooltip.nativeElement);
    
    const content = `
      <div><strong>${data.agent} × ${data.model}</strong></div>
      <div>Performance Score: ${(data.value || 0).toFixed(3)}</div>
      <div>Success Rate: ${(data.successRate * 100).toFixed(1)}%</div>
      <div>Avg Time: ${(data.avgTime / 1000).toFixed(2)}s</div>
    `;

    tooltip
      .style('display', 'block')
      .html(content)
      .style('left', (event.offsetX + 10) + 'px')
      .style('top', (event.offsetY - 10) + 'px');
  }

  private hideTooltip() {
    d3.select(this.tooltip.nativeElement)
      .style('display', 'none');
  }

  private initLegend() {
    // Create gradient for legend
    const gradient = d3.select(this.legendGradient.nativeElement)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .append('defs')
      .append('linearGradient')
      .attr('id', 'legend-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%');

    // Add color stops
    const colorScheme = this.config.colorScheme || this.defaultColorScheme;
    colorScheme.forEach((color, i) => {
      gradient.append('stop')
        .attr('offset', `${(i / (colorScheme.length - 1)) * 100}%`)
        .attr('stop-color', color);
    });

    d3.select(this.legendGradient.nativeElement)
      .select('svg')
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('fill', 'url(#legend-gradient)');
  }

  private updateLegend() {
    // Update gradient colors based on current color scale
    const gradient = d3.select(this.legendGradient.nativeElement)
      .select('linearGradient');

    gradient.selectAll('stop').remove();

    const colorScale = d3.scaleSequential()
      .domain([this.minValue, this.maxValue])
      .interpolator(d3.interpolateBlues);

    // Create 10 color stops
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const value = this.minValue + t * (this.maxValue - this.minValue);
      gradient.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(value));
    }
  }

  getLegendTitle(): string {
    switch (this.selectedMetric) {
      case 'avgTime':
        return 'Execution Time';
      case 'successRate':
        return 'Success Rate';
      case 'performance':
      default:
        return 'Performance Score';
    }
  }

  formatLegendValue(value: number): string {
    switch (this.selectedMetric) {
      case 'avgTime':
        return `${(value / 1000).toFixed(1)}s`;
      case 'successRate':
        return `${(value * 100).toFixed(0)}%`;
      case 'performance':
      default:
        return value.toFixed(2);
    }
  }
}