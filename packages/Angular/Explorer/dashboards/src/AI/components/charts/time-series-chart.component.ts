import { Component, Input, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import * as d3 from 'd3';
import { TrendData } from '../../services/ai-instrumentation.service';

export interface TimeSeriesConfig {
  width?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  height?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  margin?: { top: number; right: number; bottom: number; left: number };  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  showGrid?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  showTooltip?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  animationDuration?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  colors?: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  useDualAxis?: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface DataPointClickEvent {
  data: TrendData;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  metric: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  event: MouseEvent;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

@Component({
  standalone: false,
  selector: 'app-time-series-chart',
  template: `
    <div class="time-series-chart">
      @if (title) {
        <div class="chart-header">
          <h4 class="chart-title">{{ title }}</h4>
          @if (ShowLegend) {
            <div class="chart-legend">
              @for (metric of VisibleMetrics; track metric) {
                <div
                  class="legend-item"
                  [mjClickable]="(IsMetricVisible(metric) ? 'Hide ' : 'Show ') + GetMetricLabel(metric)"
                  [attr.aria-pressed]="IsMetricVisible(metric)"
                  (click)="ToggleMetric(metric)"
                  [class.legend-item--disabled]="!IsMetricVisible(metric)"
                >
                  <div
                    class="legend-color"
                    [style.background-color]="GetMetricColor(metric)"
                  ></div>
                  <span class="legend-label">{{ GetMetricLabel(metric) }}</span>
                </div>
              }
            </div>
          }
        </div>
      }
      
      <div class="chart-container">
        <svg #chartSvg></svg>
        <div class="chart-tooltip" #tooltip style="display: none;"></div>
      </div>
    </div>
  `,
  // ViewEncapsulation.None: the SVG nodes are created by D3 at runtime, so they never carry
  // Angular's emulated-encapsulation attribute and component-scoped rules cannot reach them.
  // Every selector below is therefore rooted at the host tag, which keeps them local without
  // ::ng-deep.
  encapsulation: ViewEncapsulation.None,
  styles: [`
    app-time-series-chart .time-series-chart {
      background: var(--mj-bg-surface);
      border-radius: var(--mj-radius-md);
      box-shadow: var(--mj-shadow-sm);
      padding: var(--mj-space-3);
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden; /* Ensure content doesn't overflow */
    }

    app-time-series-chart .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--mj-space-2);
      flex-wrap: wrap;
      gap: var(--mj-space-3);
      flex-shrink: 0; /* Prevent header from being squeezed */
    }

    app-time-series-chart .chart-title {
      margin: 0;
      font-size: var(--mj-text-sm);
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-primary);
    }

    app-time-series-chart .chart-legend {
      display: flex;
      gap: var(--mj-space-4);
      flex-wrap: wrap;
    }

    app-time-series-chart .legend-item {
      display: flex;
      align-items: center;
      gap: var(--mj-space-1);
      cursor: pointer;
      transition: opacity 0.2s ease;
      font-size: var(--mj-text-xs);
      border-radius: var(--mj-radius-sm);
    }

    app-time-series-chart .legend-item:focus-visible {
      outline: none;
      box-shadow: var(--mj-focus-ring);
    }

    app-time-series-chart .legend-item--disabled {
      opacity: 0.4;
    }

    app-time-series-chart .legend-color {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }

    app-time-series-chart .legend-label {
      color: var(--mj-text-muted);
      font-weight: var(--mj-font-medium);
    }

    app-time-series-chart .chart-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      min-height: 0; /* Important: allows flex child to shrink below content size */
    }

    app-time-series-chart .chart-container svg {
      width: 100%;
      height: 100%;
    }

    /* An elevated surface with primary text: both flip together in dark mode. (A fixed
       rgba(0,0,0,.8) background with --mj-text-inverse text went dark-on-black in dark mode.) */
    app-time-series-chart .chart-tooltip {
      position: absolute;
      background: var(--mj-bg-surface-elevated);
      color: var(--mj-text-primary);
      border: 1px solid var(--mj-border-default);
      box-shadow: var(--mj-shadow-md);
      padding: var(--mj-space-2) var(--mj-space-3);
      border-radius: var(--mj-radius-sm);
      font-size: var(--mj-text-xs);
      font-weight: var(--mj-font-normal);
      line-height: var(--mj-leading-snug);
      pointer-events: none;
      z-index: var(--mj-z-tooltip);
      max-width: 220px;
    }

    app-time-series-chart .chart-tooltip__hint {
      margin-top: var(--mj-space-2);
      padding-top: var(--mj-space-2);
      border-top: 1px solid var(--mj-border-subtle);
      color: var(--mj-text-muted);
    }

    /* D3-rendered chart nodes */
    app-time-series-chart .chart-line {
      fill: none;
      stroke-width: 2;
    }

    app-time-series-chart .chart-area {
      fill-opacity: 0.1;
    }

    app-time-series-chart .chart-dot {
      transition: r 0.1s ease;
    }

    app-time-series-chart .chart-dot:hover {
      filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.3));
    }

    app-time-series-chart .grid-line {
      stroke: var(--mj-border-subtle);
      stroke-width: 1;
    }

    app-time-series-chart .axis {
      font-size: 11px;
      color: var(--mj-text-muted);
    }

    app-time-series-chart .axis path {
      stroke: var(--mj-border-default);
    }

    app-time-series-chart .axis .tick line {
      stroke: var(--mj-border-default);
    }

    app-time-series-chart .axis-y-left {
      color: var(--mj-brand-primary);
    }

    app-time-series-chart .axis-y-right {
      color: var(--mj-status-success);
    }

    app-time-series-chart .axis-label {
      font-weight: var(--mj-font-medium);
    }

    @media (max-width: 768px) {
      app-time-series-chart .chart-header {
        flex-direction: column;
        align-items: flex-start;
      }

      app-time-series-chart .chart-legend {
        width: 100%;
        justify-content: flex-start;
      }
    }
  `]
})
export class TimeSeriesChartComponent implements OnInit, OnDestroy, AfterViewInit {
  private _data: TrendData[] = [];
  private _config: TimeSeriesConfig = {};
  private viewReady = false;

  @Input() set Data(value: TrendData[]) {
    this._data = value ?? [];
    if (this.viewReady) {
      this.updateChart();
    }
  }
  get Data(): TrendData[] {
    return this._data;
  }

  /** @deprecated Use {@link Data}. */
  @Input() set data(value: TrendData[]) {
    this.Data = value;
  }
  /** @deprecated Use {@link Data}. */
  get data(): TrendData[] {
    return this.Data;
  }
  @Input() title?: string;
  @Input() set config(value: TimeSeriesConfig) {
    this._config = value ?? {};
    this.applyConfig();
    if (this.viewReady) {
      this.updateChart();
    }
  }
  get config(): TimeSeriesConfig {
    return this._config;
  }
  @Input() ShowLegend = true;

  /** @deprecated Use {@link ShowLegend}. */
  @Input() set showLegend(value: TimeSeriesChartComponent['ShowLegend']) {
    this.ShowLegend = value;
  }
  /** @deprecated Use {@link ShowLegend}. */
  get showLegend(): TimeSeriesChartComponent['ShowLegend'] {
    return this.ShowLegend;
  }
  @Input() ShowControls = true;

  /** @deprecated Use {@link ShowControls}. */
  @Input() set showControls(value: TimeSeriesChartComponent['ShowControls']) {
    this.ShowControls = value;
  }
  /** @deprecated Use {@link ShowControls}. */
  get showControls(): TimeSeriesChartComponent['ShowControls'] {
    return this.ShowControls;
  }
  
  @Output() DataPointClick: EventEmitter<DataPointClickEvent> = new EventEmitter<DataPointClickEvent>();

  /**
   * @deprecated Use {@link DataPointClick}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (dataPointClick) keeps working. Must stay AFTER DataPointClick: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() dataPointClick = this.DataPointClick;
  @Output() TimeRangeChange = new EventEmitter<string>();

  /**
   * @deprecated Use {@link TimeRangeChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (timeRangeChange) keeps working. Must stay AFTER TimeRangeChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() timeRangeChange = this.TimeRangeChange;

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

  private svg!: d3.Selection<SVGElement, unknown, null, undefined>;
  private width = 0;
  private height = 0;
  private margin = { top: 10, right: 70, bottom: 50, left: 70 }; // Increased bottom margin for x-axis labels

  // Chart configuration — resolved from CSS custom properties for D3 color interpolation
  private defaultColors: string[] = [];
  
  // Metrics configuration
  VisibleMetrics = ['executions', 'cost', 'tokens', 'avgTime', 'errors'];

  /** @deprecated Use {@link VisibleMetrics}. */
  get visibleMetrics() {
    return this.VisibleMetrics;
  }
  /** @deprecated Use {@link VisibleMetrics}. */
  set visibleMetrics(value) {
    this.VisibleMetrics = value;
  }
  private hiddenMetrics = new Set<string>();


  ngOnInit() {
    this.defaultColors = this.getDefaultColors();
    this.applyConfig();
  }

  /**
   * Reads chart-series colors from CSS custom properties so D3 can use
   * resolved values for color interpolation while remaining themeable.
   */
  private getDefaultColors(): string[] {
    const style = getComputedStyle(document.documentElement);
    return [
      '--mj-brand-primary',
      '--mj-status-success',
      '--mj-status-warning',
      '--mj-status-error',
      '--mj-viz-5',
    ].map(token => style.getPropertyValue(token).trim());
  }

  ngAfterViewInit() {
    this.initChart();
    this.viewReady = true;
    this.updateChart();
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
    this.svg = d3.select(this.ChartSvg.nativeElement);
    
    // Set up responsive behavior
    d3.select(window).on('resize.timeseries', () => this.updateChart());
  }

  private updateChart() {
    if (!this.Data || this.Data.length === 0) {
      this.svg.selectAll('*').remove();
      return;
    }

    this.calculateDimensions();
    this.svg.selectAll('*').remove();
    this.drawChart();
  }

  private calculateDimensions() {
    const container = this.ChartSvg.nativeElement.parentElement!;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Use config dimensions or fallback to container dimensions
    this.width = (this.config.width || containerWidth) - this.margin.left - this.margin.right;
    this.height = (this.config.height || Math.max(containerHeight, 200)) - this.margin.top - this.margin.bottom;
    
    // Ensure minimum dimensions for usability
    this.width = Math.max(this.width, 200);
    this.height = Math.max(this.height, 150);
    
    this.svg
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.height + this.margin.top + this.margin.bottom);
  }

  private drawChart() {
    const g = this.svg.append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(this.Data, d => d.timestamp) as [Date, Date])
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

    if (this.config.useDualAxis !== false) {
      // Dual axis mode: Left axis (cost, avgTime), Right axis (executions, tokens, errors)
      const leftAxisMetrics = ['cost', 'avgTime'];
      const rightAxisMetrics = ['executions', 'tokens', 'errors'];
      // Each axis is sized to the series still shown on it: hiding Tokens (millions) must let
      // Executions (hundreds) use the axis instead of staying flat on the baseline.
      const shown = (metrics: string[]) => {
        const visible = metrics.filter(m => !this.hiddenMetrics.has(m));
        return visible.length > 0 ? visible : metrics;
      };

      // Create left axis scale (cost and time)
      const leftValues = shown(leftAxisMetrics).flatMap(metric =>
        this.Data.map(d => {
          const value = this.getMetricValue(d, metric);
          // Normalize avgTime to seconds for better scale comparison with cost
          return metric === 'avgTime' ? (value || 0) / 1000 : (value || 0);
        }).filter((v): v is number => v != null)
      );

      if (leftValues.length > 0) {
        const maxLeftValue = Math.max(...leftValues);
        const leftScale = d3.scaleLinear()
          .domain([0, maxLeftValue])
          .range([this.height, 0])
          .nice();

        leftAxisMetrics.forEach(metric => scales[metric] = leftScale);
      }

      // Create right axis scale (count-based metrics)
      const rightValues = shown(rightAxisMetrics).flatMap(metric =>
        this.Data.map(d => this.getMetricValue(d, metric)).filter((v): v is number => v != null)
      );

      if (rightValues.length > 0) {
        const maxRightValue = Math.max(...rightValues);
        const rightScale = d3.scaleLinear()
          .domain([0, maxRightValue])
          .range([this.height, 0])
          .nice();

        rightAxisMetrics.forEach(metric => scales[metric] = rightScale);
      }
    } else {
      // Single axis mode (original behavior)
      const metricGroups = {
        count: ['executions', 'errors'],
        cost: ['cost'],
        tokens: ['tokens'],
        time: ['avgTime']
      };

      Object.entries(metricGroups).forEach(([groupName, metrics]) => {
        const allValues = metrics.flatMap(metric =>
          this.Data.map(d => this.getMetricValue(d, metric)).filter((v): v is number => v != null)
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
    }

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
        .ticks(this.getOptimalTickCount())
        .tickFormat(this.getTimeFormat() as any));

    if (this.config.useDualAxis !== false) {
      // Dual Y-axis mode
      const leftAxisMetrics = ['cost', 'avgTime'];
      const rightAxisMetrics = ['executions', 'tokens', 'errors'];

      // Left Y axis (cost, time)
      const leftScale = scales[leftAxisMetrics[0]];
      if (leftScale) {
        g.append('g')
          .attr('class', 'axis axis-y axis-y-left')
          .call(d3.axisLeft(leftScale)
            .ticks(5)
            .tickFormat((d) => {
              const value = d as number;
              // Format based on value range - if > 1, likely cost, else time in seconds
              return value > 1 ? `$${value.toFixed(2)}` : `${value.toFixed(1)}s`;
            }));

        // Left axis label
        g.append('text')
          .attr('class', 'axis-label axis-label-left')
          .attr('transform', 'rotate(-90)')
          .attr('y', 0 - this.margin.left + 20)
          .attr('x', 0 - (this.height / 2))
          .style('text-anchor', 'middle')
          .style('font-size', '12px')
          .style('fill', 'var(--mj-text-muted)')
          .text('Cost ($) / Time (s)');
      }

      // Right Y axis (counts)
      const rightScale = scales[rightAxisMetrics[0]];
      if (rightScale) {
        g.append('g')
          .attr('class', 'axis axis-y axis-y-right')
          .attr('transform', `translate(${this.width},0)`)
          .call(d3.axisRight(rightScale)
            .ticks(5)
            .tickFormat((d) => {
              const value = d as number;
              // Format large numbers with K/M suffixes
              if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
              if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
              return value.toString();
            }));

        // Right axis label
        g.append('text')
          .attr('class', 'axis-label axis-label-right')
          .attr('transform', 'rotate(90)')
          .attr('y', 0 - this.width - this.margin.right + 20)
          .attr('x', this.height / 2)
          .style('text-anchor', 'middle')
          .style('font-size', '12px')
          .style('fill', 'var(--mj-text-muted)')
          .text('Count (Executions / Tokens)');
      }
    } else {
      // Single Y axis (original behavior)
      const firstScale = Object.values(scales)[0] as d3.ScaleLinear<number, number>;
      if (firstScale) {
        g.append('g')
          .attr('class', 'axis axis-y')
          .call(d3.axisLeft(firstScale).ticks(5));
      }
    }
  }

  private drawMetrics(g: any, xScale: any, scales: any) {
    // Create a group for lines and areas
    const linesGroup = g.append('g').attr('class', 'lines-group');
    
    // First draw all lines and areas
    this.VisibleMetrics.forEach((metric) => {
      if (this.hiddenMetrics.has(metric) || !scales[metric]) return;

      const color = this.GetMetricColor(metric);
      const scale = scales[metric];

      // Create line generator with proper value transformation
      // A missing value (an unpriced bucket's cost is null) is a GAP, never a zero.
      const hasValue = (d: TrendData) => this.getMetricValue(d, metric) != null;
      const line = d3.line<TrendData>()
        .defined(hasValue)
        .x(d => xScale(d.timestamp))
        .y(d => {
          const value = this.getMetricValue(d, metric) ?? 0;
          // Normalize avgTime to seconds if using dual axis
          const transformedValue = (this.config.useDualAxis !== false && metric === 'avgTime') 
            ? value / 1000 : value;
          return scale(transformedValue);
        })
        .curve(d3.curveMonotoneX);

      // Create area generator with proper value transformation
      const area = d3.area<TrendData>()
        .defined(hasValue)
        .x(d => xScale(d.timestamp))
        .y0(this.height)
        .y1(d => {
          const value = this.getMetricValue(d, metric) ?? 0;
          // Normalize avgTime to seconds if using dual axis
          const transformedValue = (this.config.useDualAxis !== false && metric === 'avgTime') 
            ? value / 1000 : value;
          return scale(transformedValue);
        })
        .curve(d3.curveMonotoneX);

      // Draw area (optional)
      if (metric === 'executions' || metric === 'cost') {
        linesGroup.append('path')
          .datum(this.Data)
          .attr('class', `chart-area chart-area--${metric}`)
          .attr('d', area)
          .attr('fill', color);
      }

      // Draw line
      linesGroup.append('path')
        .datum(this.Data)
        .attr('class', `chart-line chart-line--${metric}`)
        .attr('d', line)
        .attr('stroke', color);
    });
    
    // Then create dots group on top of everything
    const dotsGroup = g.append('g').attr('class', 'dots-group').style('pointer-events', 'all');
    
    // Draw all dots in a separate pass so they're all on top
    this.VisibleMetrics.forEach((metric) => {
      if (this.hiddenMetrics.has(metric) || !scales[metric]) return;
      
      const color = this.GetMetricColor(metric);
      const scale = scales[metric];
      
      // Draw dots with click events - only for non-zero values
      const dotsData = this.Data.filter(d => {
        const value = this.getMetricValue(d, metric);
        return value != null && value > 0;
      });
      
      const dots = dotsGroup.selectAll(`.chart-dot--${metric}`)
        .data(dotsData)
        .enter().append('circle')
        .attr('class', `chart-dot chart-dot--${metric}`)
        .attr('cx', (d: TrendData) => xScale(d.timestamp))
        .attr('cy', (d: TrendData) => {
          const value = this.getMetricValue(d, metric) || 0;
          // Normalize avgTime to seconds if using dual axis
          const transformedValue = (this.config.useDualAxis !== false && metric === 'avgTime') 
            ? value / 1000 : value;
          return scale(transformedValue);
        })
        .attr('r', 4) // Slightly larger for easier clicking
        .attr('stroke', color)
        .attr('stroke-width', 2)
        .attr('fill', 'var(--mj-bg-surface)')
        .style('cursor', this.IsDrillDownEnabled ? 'pointer' : 'default')
        .style('pointer-events', 'all') // Ensure clicks are captured
        .style('z-index', 1000) // Ensure dots are on top
        .attr('data-metric', metric) // Add data attribute for debugging
        .on('mouseenter', (event: MouseEvent, d: TrendData) => {
          // Bring to front on hover
          const dot = d3.select(event.currentTarget as SVGCircleElement);
          dot.raise();
          dot.attr('r', 6);
          // Show tooltip
          if (this.config.showTooltip !== false) {
            this.showTooltip(event, d);
          }
        })
        .on('mouseleave', (event: MouseEvent, d: TrendData) => {
          const dot = d3.select(event.currentTarget as SVGCircleElement);
          dot.attr('r', 4);
          // Hide tooltip
          if (this.config.showTooltip !== false) {
            this.hideTooltip();
          }
        })
        .on('click', (event: MouseEvent, d: TrendData) => {
          event.stopPropagation();
          event.preventDefault();
          // Only emit if there's actual data
          const value = this.getMetricValue(d, metric);
          if (value != null && value > 0) {
            this.DataPointClick.emit({ data: d, metric, event });
          }
        });
    });
  }

  private drawInteractiveElements(g: any, xScale: any, scales: any) {
    if (this.config.showTooltip === false) return;

    // Note: We don't need an overlay for tooltips as the dots themselves handle interactions
    // The overlay was preventing click events on dots
  }

  private findClosestDataPoint(targetDate: Date): TrendData | null {
    if (!this.Data.length) return null;

    return this.Data.reduce((closest, current) => {
      const currentDiff = Math.abs(current.timestamp.getTime() - targetDate.getTime());
      const closestDiff = Math.abs(closest.timestamp.getTime() - targetDate.getTime());
      return currentDiff < closestDiff ? current : closest;
    });
  }

  private showTooltip(event: MouseEvent, data: TrendData) {
    const tooltip = d3.select(this.Tooltip.nativeElement);

    const costDisplay = data.cost !== null && data.cost !== undefined ? `$${data.cost.toFixed(4)}` : '\u2014 (unpriced)';
    const when = this.isDailyBuckets()
      ? d3.utcFormat('%a %b %d, %Y')(data.timestamp)
      : d3.timeFormat('%a %b %d, %H:%M')(data.timestamp);
    const content = `
      <div><strong>${when}</strong></div>
      <div>Executions: ${data.executions.toLocaleString()}</div>
      <div>Cost: ${costDisplay}</div>
      <div>Tokens: ${data.tokens.toLocaleString()}</div>
      <div>Avg Time: ${data.avgTime != null ? (data.avgTime / 1000).toFixed(1) + 's' : '\u2014'}</div>
      <div>Errors: ${data.errors}</div>
      ${this.IsDrillDownEnabled ? '<div class="chart-tooltip__hint">Click a point to drill down</div>' : ''}
    `;

    tooltip.style('display', 'block').html(content);

    // Position relative to the container and flip left/up rather than letting the container's
    // overflow clip it.
    const container = this.Tooltip.nativeElement.parentElement!;
    const [x, y] = d3.pointer(event, container);
    const tip = this.Tooltip.nativeElement;
    const offset = 12;
    const left = x + offset + tip.offsetWidth > container.clientWidth ? x - offset - tip.offsetWidth : x + offset;
    const top = y + offset + tip.offsetHeight > container.clientHeight ? y - offset - tip.offsetHeight : y + offset;
    tooltip
      .style('left', Math.max(0, left) + 'px')
      .style('top', Math.max(0, top) + 'px');
  }

  /** True when consecutive points are a day or more apart, i.e. the trend is bucketed by UTC day. */
  private isDailyBuckets(): boolean {
    if (this.Data.length < 2) {
      return false;
    }
    return this.Data[1].timestamp.getTime() - this.Data[0].timestamp.getTime() >= 24 * 60 * 60 * 1000;
  }

  /**
   * True when a parent handles DataPointClick. The Executive Summary uses this chart without a
   * handler, so it must not advertise a drill-down (or show a pointer) that does nothing.
   */
  get IsDrillDownEnabled(): boolean {
    return this.DataPointClick.observed;
  }

  private hideTooltip() {
    d3.select(this.Tooltip.nativeElement)
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

  GetMetricColor(metric: string): string {
    const colors = this.config.colors || this.defaultColors;
    const index = this.VisibleMetrics.indexOf(metric);
    return colors[index % colors.length];
  }

  /** @deprecated Use {@link GetMetricColor}. */
  getMetricColor(metric: string): string {
    return this.GetMetricColor(metric);
  }

  GetMetricLabel(metric: string): string {
    const labels: { [key: string]: string } = {
      executions: 'Executions',
      cost: 'Cost ($)',
      tokens: 'Tokens',
      avgTime: 'Avg Time (ms)',
      errors: 'Errors'
    };
    return labels[metric] || metric;
  }

  /** @deprecated Use {@link GetMetricLabel}. */
  getMetricLabel(metric: string): string {
    return this.GetMetricLabel(metric);
  }

  IsMetricVisible(metric: string): boolean {
    return !this.hiddenMetrics.has(metric);
  }

  /** @deprecated Use {@link IsMetricVisible}. */
  isMetricVisible(metric: string): boolean {
    return this.IsMetricVisible(metric);
  }

  ToggleMetric(metric: string): void {
    if (this.hiddenMetrics.has(metric)) {
      this.hiddenMetrics.delete(metric);
    } else {
      this.hiddenMetrics.add(metric);
    }
    this.updateChart();
  }

  /** @deprecated Use {@link ToggleMetric}. */
  toggleMetric(metric: string): void {
    return this.ToggleMetric(metric);
  }
  
  private getTimeFormat(): (date: Date) => string {
    if (this.Data.length < 2) {
      return d3.timeFormat('%H:%M');
    }
    if (this.isDailyBuckets()) {
      // Daily buckets are UTC days; a local-time label would show the previous day west of UTC.
      return d3.utcFormat('%m/%d');
    }
    
    // Calculate the time span of the data
    const firstDate = this.Data[0].timestamp;
    const lastDate = this.Data[this.Data.length - 1].timestamp;
    const timeDiff = lastDate.getTime() - firstDate.getTime();
    const hours = timeDiff / (1000 * 60 * 60);
    const days = hours / 24;
    
    // Choose format based on time span
    if (hours <= 24) {
      // For up to 24 hours, show hours and minutes
      return d3.timeFormat('%H:%M');
    } else if (days <= 7) {
      // For up to 7 days, show day and time
      return d3.timeFormat('%a %H:%M'); // e.g., "Mon 14:00"
    } else if (days <= 30) {
      // For up to 30 days, show month/day
      return d3.timeFormat('%m/%d'); // e.g., "06/13"
    } else {
      // For longer periods, show month/day/year
      return d3.timeFormat('%m/%d/%y'); // e.g., "06/13/25"
    }
  }
  
  private getOptimalTickCount(): number {
    if (this.Data.length < 2) {
      return 6;
    }
    
    // Calculate the time span of the data
    const firstDate = this.Data[0].timestamp;
    const lastDate = this.Data[this.Data.length - 1].timestamp;
    const timeDiff = lastDate.getTime() - firstDate.getTime();
    const hours = timeDiff / (1000 * 60 * 60);
    const days = hours / 24;
    
    // Adjust tick count based on time span and chart width
    const pixelsPerTick = 100; // Minimum pixels between ticks
    const maxTicks = Math.floor(this.width / pixelsPerTick);
    
    if (days <= 1) {
      return Math.min(8, maxTicks); // Show more ticks for hourly data
    } else if (days <= 7) {
      return Math.min(7, maxTicks); // One per day for weekly view
    } else if (days <= 30) {
      return Math.min(6, maxTicks); // Fewer ticks for monthly view
    } else {
      return Math.min(5, maxTicks); // Even fewer for longer periods
    }
  }

}