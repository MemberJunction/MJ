import { Component, Input, OnInit, AfterViewInit, ViewChild, ElementRef, OnDestroy, ViewEncapsulation } from '@angular/core';
import * as d3 from 'd3';

export interface HeatmapData {
  agent: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  model: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  avgTime: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  successRate: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  value?: number; // Computed performance score — case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface HeatmapConfig {
  width?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  height?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  margin?: { top: number; right: number; bottom: number; left: number };  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  colorScheme?: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  showTooltip?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  animationDuration?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** Agent and model names are record data; they must not be interpreted as markup in the tooltip. */
function escapeHtml(value: string): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
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
            <mj-dropdown
              AriaLabel="Heatmap metric"
              [Data]="MetricOptions"
              TextField="Text"
              ValueField="Value"
              [ValuePrimitive]="true"
              [ngModel]="SelectedMetric"
              (ngModelChange)="OnMetricChange($event)"
            ></mj-dropdown>
          </div>
        </div>
      </div>
      
      <div class="chart-container">
        <svg #chartSvg></svg>
        <div class="chart-tooltip" #tooltip style="display: none;"></div>
      </div>
      
      <div class="chart-legend">
        <div class="legend-title">{{ GetLegendTitle() }}</div>
        <div class="legend-gradient" #legendGradient></div>
        <div class="legend-labels">
          <span class="legend-min">{{ FormatLegendValue(MinValue) }}</span>
          <span class="legend-max">{{ FormatLegendValue(MaxValue) }}</span>
        </div>
      </div>
    </div>
  `,
  // ViewEncapsulation.None: the SVG nodes are created by D3 at runtime and never carry Angular's
  // emulated-encapsulation attribute, so every selector is rooted at the host tag instead of
  // reaching them with ::ng-deep.
  encapsulation: ViewEncapsulation.None,
  styles: [`
    app-performance-heatmap .performance-heatmap {
      background: var(--mj-bg-surface);
      border-radius: var(--mj-radius-md);
      box-shadow: var(--mj-shadow-sm);
      padding: 20px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    app-performance-heatmap .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      flex-wrap: wrap;
      gap: 12px;
    }

    app-performance-heatmap .chart-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    app-performance-heatmap .chart-controls {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    app-performance-heatmap .metric-selector {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

            app-performance-heatmap .chart-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      min-height: 200px;
    }

    app-performance-heatmap .chart-tooltip {
      position: absolute;
      background: var(--mj-bg-surface-elevated);
      color: var(--mj-text-primary);
      border: 1px solid var(--mj-border-default);
      box-shadow: var(--mj-shadow-md);
      padding: var(--mj-space-2) var(--mj-space-3);
      border-radius: var(--mj-radius-sm);
      font-size: var(--mj-text-xs);
      pointer-events: none;
      z-index: var(--mj-z-tooltip);
      max-width: 250px;
    }

    app-performance-heatmap .chart-legend {
      margin-top: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
    }

    app-performance-heatmap .legend-title {
      color: var(--mj-text-muted);
      font-weight: 500;
      white-space: nowrap;
    }

    app-performance-heatmap .legend-gradient {
      flex: 1;
      height: 16px;
      border-radius: 8px;
      position: relative;
    }

    app-performance-heatmap .legend-labels {
      display: flex;
      justify-content: space-between;
      min-width: 80px;
      color: var(--mj-text-muted);
      font-weight: 500;
    }

    /* Chart styles */
    app-performance-heatmap .heatmap-cell {
      stroke: var(--mj-bg-surface);
      stroke-width: 1;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    app-performance-heatmap .heatmap-cell:hover {
      stroke: var(--mj-text-primary);
      stroke-width: 2;
    }

    app-performance-heatmap .axis {
      font-size: 10px;
      color: var(--mj-text-muted);
    }

    app-performance-heatmap .axis path {
      stroke: var(--mj-border-default);
    }

    app-performance-heatmap .axis .tick line {
      stroke: var(--mj-border-default);
    }

    app-performance-heatmap .axis .tick text {
      fill: var(--mj-text-muted);
    }

    app-performance-heatmap .axis-label {
      font-size: 11px;
      font-weight: 500;
      fill: var(--mj-text-primary);
    }

    app-performance-heatmap .no-data {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--mj-text-disabled);
      gap: 12px;
    }

    app-performance-heatmap .no-data i {
      font-size: 32px;
      color: var(--mj-border-default);
    }

    @media (max-width: 768px) {
      app-performance-heatmap .chart-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      app-performance-heatmap .chart-legend {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      
      app-performance-heatmap .legend-gradient {
        width: 100%;
        max-width: 200px;
      }
    }
  `]
})
export class PerformanceHeatmapComponent implements OnInit, AfterViewInit, OnDestroy {
  private _data: HeatmapData[] = [];
  private _config: HeatmapConfig = {};
  private viewReady = false;

  @Input() set Data(value: HeatmapData[]) {
    this._data = value ?? [];
    // Derive the bound legend values (MinValue/MaxValue) now, before the view is checked;
    // only the D3 drawing has to wait for the view.
    this.processData();
    if (this.viewReady) {
      this.UpdateChart();
    }
  }
  get Data(): HeatmapData[] {
    return this._data;
  }

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: HeatmapData[]) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): HeatmapData[] {
    return this.Data;
  }
  @Input() title?: string;
  @Input() set config(value: HeatmapConfig) {
    this._config = value ?? {};
    this.applyConfig();
    if (this.viewReady) {
      this.UpdateChart();
    }
  }
  get config(): HeatmapConfig {
    return this._config;
  }

  readonly MetricOptions = [
    { Text: 'Performance Score', Value: 'performance' },
    { Text: 'Avg Execution Time', Value: 'avgTime' },
    { Text: 'Success Rate', Value: 'successRate' },
  ];

  OnMetricChange(metric: string): void {
    this.SelectedMetric = metric;
    this.processData();
    this.UpdateChart();
  }

  @ViewChild('chartSvg', { static: true }) ChartSvg!: ElementRef<SVGElement>;

  /** @deprecated Use {@link ChartSvg}. */
  get chartSvg(): ElementRef<SVGElement> {
    return this.ChartSvg;
  }
  /** @deprecated Use {@link ChartSvg}. */
  set chartSvg(value: ElementRef<SVGElement>) {
    this.ChartSvg = value;
  }
  @ViewChild('tooltip', { static: true }) Tooltip!: ElementRef<HTMLDivElement>;

  /** @deprecated Use {@link Tooltip}. */
  get tooltip(): ElementRef<HTMLDivElement> {
    return this.Tooltip;
  }
  /** @deprecated Use {@link Tooltip}. */
  set tooltip(value: ElementRef<HTMLDivElement>) {
    this.Tooltip = value;
  }
  @ViewChild('legendGradient', { static: true }) LegendGradient!: ElementRef<HTMLDivElement>;

  /** @deprecated Use {@link LegendGradient}. */
  get legendGradient(): ElementRef<HTMLDivElement> {
    return this.LegendGradient;
  }
  /** @deprecated Use {@link LegendGradient}. */
  set legendGradient(value: ElementRef<HTMLDivElement>) {
    this.LegendGradient = value;
  }

  private svg!: d3.Selection<SVGElement, unknown, null, undefined>;
  private width = 0;
  private height = 0;
  private margin = { top: 40, right: 20, bottom: 60, left: 80 };

  // Chart configuration
  private defaultColorScheme: string[] = [];

  private getColorScheme(): string[] {
    const style = getComputedStyle(document.documentElement);
    const surface = style.getPropertyValue('--mj-bg-surface').trim();
    const brandPrimary = style.getPropertyValue('--mj-brand-primary').trim();
    // Build a 9-stop scale from surface white through brand primary to dark brand
    const toSurface = d3.interpolateRgb(surface, brandPrimary);
    const toDark = d3.interpolateRgb(brandPrimary, d3.rgb(brandPrimary).darker(2).formatHex());
    return [
      surface,
      toSurface(0.15),
      toSurface(0.3),
      toSurface(0.5),
      toSurface(0.7),
      toSurface(0.85),
      brandPrimary,
      toDark(0.5),
      toDark(1),
    ];
  }
  
  // Data processing
  SelectedMetric = 'performance';

  /** @deprecated Use {@link SelectedMetric}. */
  get selectedMetric() {
    return this.SelectedMetric;
  }
  /** @deprecated Use {@link SelectedMetric}. */
  set selectedMetric(value) {
    this.SelectedMetric = value;
  }
  ProcessedData: HeatmapData[] = [];

  /** @deprecated Use {@link ProcessedData}. */
  get processedData(): HeatmapData[] {
    return this.ProcessedData;
  }
  /** @deprecated Use {@link ProcessedData}. */
  set processedData(value: HeatmapData[]) {
    this.ProcessedData = value;
  }
  UniqueAgents: string[] = [];

  /** @deprecated Use {@link UniqueAgents}. */
  get uniqueAgents(): string[] {
    return this.UniqueAgents;
  }
  /** @deprecated Use {@link UniqueAgents}. */
  set uniqueAgents(value: string[]) {
    this.UniqueAgents = value;
  }
  UniqueModels: string[] = [];

  /** @deprecated Use {@link UniqueModels}. */
  get uniqueModels(): string[] {
    return this.UniqueModels;
  }
  /** @deprecated Use {@link UniqueModels}. */
  set uniqueModels(value: string[]) {
    this.UniqueModels = value;
  }
  MinValue = 0;

  /** @deprecated Use {@link MinValue}. */
  get minValue() {
    return this.MinValue;
  }
  /** @deprecated Use {@link MinValue}. */
  set minValue(value) {
    this.MinValue = value;
  }
  MaxValue = 1;

  /** @deprecated Use {@link MaxValue}. */
  get maxValue() {
    return this.MaxValue;
  }
  /** @deprecated Use {@link MaxValue}. */
  set maxValue(value) {
    this.MaxValue = value;
  }

  ngOnInit() {
    this.applyConfig();
  }

  ngAfterViewInit() {
    this.initChart();
    this.viewReady = true;
    this.UpdateChart();
  }

  ngOnDestroy() {
    d3.select(window).on('resize.heatmap', null);
  }

  private applyConfig() {
    const config = this.config;
    this.margin = { ...this.margin, ...config.margin };
  }

  private initChart() {
    this.svg = d3.select(this.ChartSvg.nativeElement);
    this.initLegend();
    
    // Set up responsive behavior
    d3.select(window).on('resize.heatmap', () => this.UpdateChart());
  }

  private processData() {
    if (!this.Data || this.Data.length === 0) {
      this.ProcessedData = [];
      this.UniqueAgents = [];
      this.UniqueModels = [];
      return;
    }

    // Calculate performance scores and process data
    this.ProcessedData = this.Data.map(d => ({
      ...d,
      value: this.calculatePerformanceScore(d)
    }));

    // Get unique agents and models
    this.UniqueAgents = Array.from(new Set(this.ProcessedData.map(d => d.agent))).sort();
    this.UniqueModels = Array.from(new Set(this.ProcessedData.map(d => d.model))).sort();

    // Update value range based on selected metric
    this.updateValueRange();
  }

  private calculatePerformanceScore(data: HeatmapData): number {
    // Normalize avgTime (lower is better, scale 0-1)
    const maxTime = Math.max(...this.Data.map(d => d.avgTime));
    const normalizedTime = maxTime > 0 ? 1 - (data.avgTime / maxTime) : 1;
    
    // Success rate is already 0-1
    const normalizedSuccess = data.successRate;
    
    // Weighted combination (60% success rate, 40% speed)
    return normalizedSuccess * 0.6 + normalizedTime * 0.4;
  }

  private updateValueRange() {
    let values: number[];
    
    switch (this.SelectedMetric) {
      case 'avgTime':
        values = this.ProcessedData.map(d => d.avgTime);
        break;
      case 'successRate':
        values = this.ProcessedData.map(d => d.successRate);
        break;
      case 'performance':
      default:
        values = this.ProcessedData.map(d => d.value || 0);
        break;
    }

    this.MinValue = Math.min(...values);
    this.MaxValue = Math.max(...values);

    // Ensure reasonable range
    if (this.MinValue === this.MaxValue) {
      this.MaxValue = this.MinValue + 1;
    }
  }

  UpdateChart() {
    if (!this.ProcessedData || this.ProcessedData.length === 0) {
      this.svg.selectAll('*').remove();
      return;
    }

    this.calculateDimensions();
    this.svg.selectAll('*').remove();
    this.drawChart();
    this.updateLegend();
  }

  /** @deprecated Use {@link UpdateChart}. */
  updateChart() {
    return this.UpdateChart();
  }

  private calculateDimensions() {
    const container = this.ChartSvg.nativeElement.parentElement!;
    this.width = (this.config.width || container.clientWidth) - this.margin.left - this.margin.right;
    this.height = (this.config.height || Math.max(300, this.UniqueAgents.length * 30 + 100)) - this.margin.top - this.margin.bottom;
    
    this.svg
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom);
  }

  private drawChart() {
    const g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Create scales
    const xScale = d3.scaleBand()
      .domain(this.UniqueModels)
      .range([0, this.width])
      .padding(0.05);

    const yScale = d3.scaleBand()
      .domain(this.UniqueAgents)
      .range([0, this.height])
      .padding(0.05);

    const colorScale = d3.scaleSequential()
      .domain([this.MinValue, this.MaxValue])
      .interpolator(d3.interpolateBlues);

    // Draw cells
    const cells = g.selectAll('.heatmap-cell')
      .data(this.ProcessedData)
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
    if (this.ProcessedData.length <= 50) {
      g.selectAll('.cell-label')
        .data(this.ProcessedData)
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
    switch (this.SelectedMetric) {
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
    const luminance = (color: string): number => {
      const rgb = d3.rgb(color);
      return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    };
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue('--mj-text-primary').trim();
    const inverse = style.getPropertyValue('--mj-text-inverse').trim();
    const bg = luminance(backgroundColor);
    return Math.abs(luminance(primary) - bg) >= Math.abs(luminance(inverse) - bg) ? primary : inverse;
  }

  private formatCellValue(value: number): string {
    switch (this.SelectedMetric) {
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
    const tooltip = d3.select(this.Tooltip.nativeElement);
    
    const content = `
      <div><strong>${escapeHtml(data.agent)} × ${escapeHtml(data.model)}</strong></div>
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
    d3.select(this.Tooltip.nativeElement)
      .style('display', 'none');
  }

  private initLegend() {
    // Create gradient for legend
    const gradient = d3.select(this.LegendGradient.nativeElement)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .append('defs')
      .append('linearGradient')
      .attr('id', 'legend-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%');

    // Add color stops
    const colorScheme = this.config.colorScheme || this.getColorScheme();
    colorScheme.forEach((color, i) => {
      gradient.append('stop')
        .attr('offset', `${(i / (colorScheme.length - 1)) * 100}%`)
        .attr('stop-color', color);
    });

    d3.select(this.LegendGradient.nativeElement)
      .select('svg')
      .append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .style('fill', 'url(#legend-gradient)');
  }

  private updateLegend() {
    // Update gradient colors based on current color scale
    const gradient = d3.select(this.LegendGradient.nativeElement)
      .select('linearGradient');

    gradient.selectAll('stop').remove();

    const colorScale = d3.scaleSequential()
      .domain([this.MinValue, this.MaxValue])
      .interpolator(d3.interpolateBlues);

    // Create 10 color stops
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const value = this.MinValue + t * (this.MaxValue - this.MinValue);
      gradient.append('stop')
        .attr('offset', `${t * 100}%`)
        .attr('stop-color', colorScale(value));
    }
  }

  GetLegendTitle(): string {
    switch (this.SelectedMetric) {
      case 'avgTime':
        return 'Execution Time';
      case 'successRate':
        return 'Success Rate';
      case 'performance':
      default:
        return 'Performance Score';
    }
  }

  /** @deprecated Use {@link GetLegendTitle}. */
  getLegendTitle(): string {
    return this.GetLegendTitle();
  }

  FormatLegendValue(value: number): string {
    switch (this.SelectedMetric) {
      case 'avgTime':
        return `${(value / 1000).toFixed(1)}s`;
      case 'successRate':
        return `${(value * 100).toFixed(0)}%`;
      case 'performance':
      default:
        return value.toFixed(2);
    }
  }

  /** @deprecated Use {@link FormatLegendValue}. */
  formatLegendValue(value: number): string {
    return this.FormatLegendValue(value);
  }
}