import { Component, Input, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import * as d3 from 'd3';
import { TrendData } from '../../services/ai-instrumentation.service';

export interface TimeSeriesConfig {
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  showGrid?: boolean;
  showTooltip?: boolean;
  animationDuration?: number;
  colors?: string[];
}

@Component({
  selector: 'app-time-series-chart',
  template: `
    <div class="time-series-chart">
      <div class="chart-header" *ngIf="title">
        <h4 class="chart-title">{{ title }}</h4>
        <div class="chart-legend" *ngIf="showLegend">
          <div 
            class="legend-item"
            *ngFor="let metric of visibleMetrics; trackBy: trackByMetric"
            (click)="toggleMetric(metric)"
            [class.legend-item--disabled]="!isMetricVisible(metric)"
          >
            <div 
              class="legend-color"
              [style.background-color]="getMetricColor(metric)"
            ></div>
            <span class="legend-label">{{ getMetricLabel(metric) }}</span>
          </div>
        </div>
      </div>
      
      <div class="chart-container">
        <svg #chartSvg></svg>
        <div class="chart-tooltip" #tooltip style="display: none;"></div>
      </div>
      
      <div class="chart-controls" *ngIf="showControls">
        <button 
          class="control-btn"
          *ngFor="let range of timeRanges"
          [class.active]="selectedTimeRange === range.value"
          (click)="selectTimeRange(range.value)"
        >
          {{ range.label }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .time-series-chart {
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

    .chart-legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: opacity 0.2s ease;
      font-size: 12px;
    }

    .legend-item--disabled {
      opacity: 0.4;
    }

    .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    .legend-label {
      color: #666;
      font-weight: 500;
    }

    .chart-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .chart-tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      z-index: 1000;
      max-width: 200px;
    }

    .chart-controls {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      justify-content: center;
    }

    .control-btn {
      background: #f5f5f5;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      color: #666;
    }

    .control-btn:hover {
      background: #e0e0e0;
    }

    .control-btn.active {
      background: #2196f3;
      color: white;
    }

    /* Chart styles */
    :host ::ng-deep .chart-line {
      fill: none;
      stroke-width: 2;
    }

    :host ::ng-deep .chart-area {
      fill-opacity: 0.1;
    }

    :host ::ng-deep .chart-dot {
      fill: white;
      stroke-width: 2;
      r: 3;
    }

    :host ::ng-deep .chart-dot:hover {
      r: 5;
    }

    :host ::ng-deep .grid-line {
      stroke: #f0f0f0;
      stroke-width: 1;
    }

    :host ::ng-deep .axis {
      font-size: 11px;
      color: #666;
    }

    :host ::ng-deep .axis path {
      stroke: #ddd;
    }

    :host ::ng-deep .axis .tick line {
      stroke: #ddd;
    }

    @media (max-width: 768px) {
      .chart-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .chart-legend {
        width: 100%;
        justify-content: flex-start;
      }
      
      .chart-controls {
        flex-wrap: wrap;
      }
    }
  `]
})
export class TimeSeriesChartComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @Input() data: TrendData[] = [];
  @Input() title?: string;
  @Input() config: TimeSeriesConfig = {};
  @Input() showLegend = true;
  @Input() showControls = true;

  @ViewChild('chartSvg', { static: true }) chartSvg!: ElementRef<SVGElement>;
  @ViewChild('tooltip', { static: true }) tooltip!: ElementRef<HTMLDivElement>;

  private svg!: d3.Selection<SVGElement, unknown, null, undefined>;
  private width = 0;
  private height = 0;
  private margin = { top: 20, right: 30, bottom: 40, left: 60 };

  // Chart configuration
  private defaultColors = ['#2196f3', '#4caf50', '#ff9800', '#f44336', '#9c27b0'];
  
  // Metrics configuration
  visibleMetrics = ['executions', 'cost', 'tokens', 'avgTime', 'errors'];
  private hiddenMetrics = new Set<string>();

  // Time range controls
  selectedTimeRange = '24h';
  timeRanges = [
    { label: '1H', value: '1h' },
    { label: '6H', value: '6h' },
    { label: '24H', value: '24h' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' }
  ];

  ngOnInit() {
    this.applyConfig();
  }

  ngAfterViewInit() {
    this.initChart();
    this.updateChart();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateChart();
    }
    if (changes['config'] && !changes['config'].firstChange) {
      this.applyConfig();
      this.updateChart();
    }
  }

  ngOnDestroy() {
    // Cleanup D3 event listeners
    d3.select(window).on('resize.timeseries', null);
  }

  private applyConfig() {
    const config = this.config;
    this.margin = { ...this.margin, ...config.margin };
  }

  private initChart() {
    this.svg = d3.select(this.chartSvg.nativeElement);
    
    // Set up responsive behavior
    d3.select(window).on('resize.timeseries', () => this.updateChart());
  }

  private updateChart() {
    if (!this.data || this.data.length === 0) {
      this.svg.selectAll('*').remove();
      return;
    }

    this.calculateDimensions();
    this.svg.selectAll('*').remove();
    this.drawChart();
  }

  private calculateDimensions() {
    const container = this.chartSvg.nativeElement.parentElement!;
    this.width = (this.config.width || container.clientWidth) - this.margin.left - this.margin.right;
    this.height = (this.config.height || container.clientHeight || 300) - this.margin.top - this.margin.bottom;
    
    this.svg
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom);
  }

  private drawChart() {
    const g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(this.data, d => d.timestamp) as [Date, Date])
      .range([0, this.width]);

    // Create separate scales for different metrics
    const scales = this.createMetricScales();

    // Draw grid
    if (this.config.showGrid !== false) {
      this.drawGrid(g, xScale, scales);
    }

    // Draw axes
    this.drawAxes(g, xScale, scales);

    // Draw data lines and areas
    this.drawMetrics(g, xScale, scales);

    // Draw interactive elements
    this.drawInteractiveElements(g, xScale, scales);
  }

  private createMetricScales() {
    const scales: { [key: string]: d3.ScaleLinear<number, number> } = {};

    // Group metrics by scale type (some share scales for better comparison)
    const metricGroups = {
      count: ['executions', 'errors'],
      cost: ['cost'],
      tokens: ['tokens'],
      time: ['avgTime']
    };

    Object.entries(metricGroups).forEach(([groupName, metrics]) => {
      const allValues = metrics.flatMap(metric =>
        this.data.map(d => this.getMetricValue(d, metric)).filter((v): v is number => v != null)
      );

      if (allValues.length > 0) {
        const maxValue = Math.max(...allValues);
        const scale = d3.scaleLinear()
          .domain([0, maxValue])
          .range([this.height, 0])
          .nice();

        metrics.forEach(metric => scales[metric] = scale);
      }
    });

    return scales;
  }

  private drawGrid(g: any, xScale: any, scales: any) {
    // Vertical grid lines
    g.selectAll('.grid-line-x')
      .data(xScale.ticks(6))
      .enter().append('line')
      .attr('class', 'grid-line grid-line-x')
      .attr('x1', (d: Date) => xScale(d))
      .attr('x2', (d: Date) => xScale(d))
      .attr('y1', 0)
      .attr('y2', this.height);

    // Horizontal grid lines (use first scale)
    const firstScale = Object.values(scales)[0] as d3.ScaleLinear<number, number>;
    if (firstScale) {
      g.selectAll('.grid-line-y')
        .data(firstScale.ticks(5))
        .enter().append('line')
        .attr('class', 'grid-line grid-line-y')
        .attr('x1', 0)
        .attr('x2', this.width)
        .attr('y1', (d: number) => firstScale(d))
        .attr('y2', (d: number) => firstScale(d));
    }
  }

  private drawAxes(g: any, xScale: any, scales: any) {
    // X axis
    g.append('g')
      .attr('class', 'axis axis-x')
      .attr('transform', `translate(0,${this.height})`)
      .call(d3.axisBottom(xScale)
        .ticks(6)
        .tickFormat(d3.timeFormat('%H:%M') as any));

    // Y axis (use first scale)
    const firstScale = Object.values(scales)[0] as d3.ScaleLinear<number, number>;
    if (firstScale) {
      g.append('g')
        .attr('class', 'axis axis-y')
        .call(d3.axisLeft(firstScale).ticks(5));
    }
  }

  private drawMetrics(g: any, xScale: any, scales: any) {
    this.visibleMetrics.forEach((metric, index) => {
      if (this.hiddenMetrics.has(metric) || !scales[metric]) return;

      const color = this.getMetricColor(metric);
      const scale = scales[metric];

      // Create line generator
      const line = d3.line<TrendData>()
        .x(d => xScale(d.timestamp))
        .y(d => scale(this.getMetricValue(d, metric) || 0))
        .curve(d3.curveMonotoneX);

      // Create area generator
      const area = d3.area<TrendData>()
        .x(d => xScale(d.timestamp))
        .y0(this.height)
        .y1(d => scale(this.getMetricValue(d, metric) || 0))
        .curve(d3.curveMonotoneX);

      // Draw area (optional)
      if (metric === 'executions' || metric === 'cost') {
        g.append('path')
          .datum(this.data)
          .attr('class', `chart-area chart-area--${metric}`)
          .attr('d', area)
          .attr('fill', color);
      }

      // Draw line
      g.append('path')
        .datum(this.data)
        .attr('class', `chart-line chart-line--${metric}`)
        .attr('d', line)
        .attr('stroke', color);

      // Draw dots
      g.selectAll(`.chart-dot--${metric}`)
        .data(this.data)
        .enter().append('circle')
        .attr('class', `chart-dot chart-dot--${metric}`)
        .attr('cx', (d: TrendData) => xScale(d.timestamp))
        .attr('cy', (d: TrendData) => scale(this.getMetricValue(d, metric) || 0))
        .attr('stroke', color);
    });
  }

  private drawInteractiveElements(g: any, xScale: any, scales: any) {
    if (this.config.showTooltip === false) return;

    // Create invisible overlay for mouse events
    const overlay = g.append('rect')
      .attr('class', 'chart-overlay')
      .attr('width', this.width)
      .attr('height', this.height)
      .attr('fill', 'none')
      .attr('pointer-events', 'all');

    // Tooltip interactions
    overlay
      .on('mousemove', (event: MouseEvent) => {
        const [mouseX] = d3.pointer(event);
        const date = xScale.invert(mouseX);
        const closest = this.findClosestDataPoint(date);
        if (closest) {
          this.showTooltip(event, closest);
        }
      })
      .on('mouseout', () => {
        this.hideTooltip();
      });
  }

  private findClosestDataPoint(targetDate: Date): TrendData | null {
    if (!this.data.length) return null;

    return this.data.reduce((closest, current) => {
      const currentDiff = Math.abs(current.timestamp.getTime() - targetDate.getTime());
      const closestDiff = Math.abs(closest.timestamp.getTime() - targetDate.getTime());
      return currentDiff < closestDiff ? current : closest;
    });
  }

  private showTooltip(event: MouseEvent, data: TrendData) {
    const tooltip = d3.select(this.tooltip.nativeElement);
    
    const content = `
      <div><strong>${d3.timeFormat('%H:%M')(data.timestamp)}</strong></div>
      <div>Executions: ${data.executions}</div>
      <div>Cost: $${data.cost.toFixed(4)}</div>
      <div>Tokens: ${data.tokens.toLocaleString()}</div>
      <div>Avg Time: ${(data.avgTime / 1000).toFixed(1)}s</div>
      <div>Errors: ${data.errors}</div>
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

  private getMetricValue(data: TrendData, metric: string): number | null {
    switch (metric) {
      case 'executions': return data.executions;
      case 'cost': return data.cost;
      case 'tokens': return data.tokens;
      case 'avgTime': return data.avgTime;
      case 'errors': return data.errors;
      default: return null;
    }
  }

  getMetricColor(metric: string): string {
    const colors = this.config.colors || this.defaultColors;
    const index = this.visibleMetrics.indexOf(metric);
    return colors[index % colors.length];
  }

  getMetricLabel(metric: string): string {
    const labels: { [key: string]: string } = {
      executions: 'Executions',
      cost: 'Cost ($)',
      tokens: 'Tokens',
      avgTime: 'Avg Time (ms)',
      errors: 'Errors'
    };
    return labels[metric] || metric;
  }

  isMetricVisible(metric: string): boolean {
    return !this.hiddenMetrics.has(metric);
  }

  toggleMetric(metric: string): void {
    if (this.hiddenMetrics.has(metric)) {
      this.hiddenMetrics.delete(metric);
    } else {
      this.hiddenMetrics.add(metric);
    }
    this.updateChart();
  }

  selectTimeRange(range: string): void {
    this.selectedTimeRange = range;
    // Emit event or filter data based on range
    // This would typically trigger a data reload in the parent component
  }

  trackByMetric(index: number, metric: string): string {
    return metric;
  }
}