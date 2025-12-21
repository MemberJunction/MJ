import { Component, Input, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, OnChanges, SimpleChanges, Output, EventEmitter } from '@angular/core';
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
  useDualAxis?: boolean;
}

export interface DataPointClickEvent {
  data: TrendData;
  metric: string;
  event: MouseEvent;
}

@Component({
  standalone: false,
  selector: 'app-time-series-chart',
  template: `
    <div class="time-series-chart">
      @if (title) {
        <div class="chart-header">
          <h4 class="chart-title">{{ title }}</h4>
          @if (showLegend) {
            <div class="chart-legend">
              @for (metric of visibleMetrics; track metric) {
                <div 
                  class="legend-item"
                  (click)="toggleMetric(metric)"
                  [class.legend-item--disabled]="!isMetricVisible(metric)"
                >
                  <div 
                    class="legend-color"
                    [style.background-color]="getMetricColor(metric)"
                  ></div>
                  <span class="legend-label">{{ getMetricLabel(metric) }}</span>
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
  styles: [`
    .time-series-chart {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      padding: 12px;
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden; /* Ensure content doesn't overflow */
    }

    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      flex-wrap: wrap;
      gap: 12px;
      flex-shrink: 0; /* Prevent header from being squeezed */
    }

    .chart-title {
      margin: 0;
      font-size: 14px;
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
      gap: 4px;
      cursor: pointer;
      transition: opacity 0.2s ease;
      font-size: 11px;
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
      min-height: 0; /* Important: allows flex child to shrink below content size */
    }

    .chart-container svg {
      width: 100%;
      height: 100%;
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


    /* Chart styles */
    :host ::ng-deep .chart-line {
      fill: none;
      stroke-width: 2;
    }

    :host ::ng-deep .chart-area {
      fill-opacity: 0.1;
    }

    :host ::ng-deep .chart-dot {
      transition: r 0.1s ease;
    }

    :host ::ng-deep .chart-dot:hover {
      filter: drop-shadow(0 0 4px rgba(0,0,0,0.3));
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

    :host ::ng-deep .axis-y-left {
      color: #2196f3;
    }

    :host ::ng-deep .axis-y-right {
      color: #4caf50;
    }

    :host ::ng-deep .axis-label {
      font-weight: 500;
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
  
  @Output() dataPointClick: EventEmitter<DataPointClickEvent> = new EventEmitter<DataPointClickEvent>();
  @Output() timeRangeChange = new EventEmitter<string>();

  @ViewChild('chartSvg', { static: true }) chartSvg!: ElementRef<SVGElement>;
  @ViewChild('tooltip', { static: true }) tooltip!: ElementRef<HTMLDivElement>;

  private svg!: d3.Selection<SVGElement, unknown, null, undefined>;
  private width = 0;
  private height = 0;
  private margin = { top: 10, right: 70, bottom: 50, left: 70 }; // Increased bottom margin for x-axis labels

  // Chart configuration
  private defaultColors = ['#2196f3', '#4caf50', '#ff9800', '#f44336', '#9c27b0'];
  
  // Metrics configuration
  visibleMetrics = ['executions', 'cost', 'tokens', 'avgTime', 'errors'];
  private hiddenMetrics = new Set<string>();


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

    if (this.config.useDualAxis !== false) {
      // Dual axis mode: Left axis (cost, avgTime), Right axis (executions, tokens, errors)
      const leftAxisMetrics = ['cost', 'avgTime'];
      const rightAxisMetrics = ['executions', 'tokens', 'errors'];

      // Create left axis scale (cost and time)
      const leftValues = leftAxisMetrics.flatMap(metric =>
        this.data.map(d => {
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
      const rightValues = rightAxisMetrics.flatMap(metric =>
        this.data.map(d => this.getMetricValue(d, metric)).filter((v): v is number => v != null)
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
          .style('fill', '#666')
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
          .style('fill', '#666')
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
    this.visibleMetrics.forEach((metric) => {
      if (this.hiddenMetrics.has(metric) || !scales[metric]) return;

      const color = this.getMetricColor(metric);
      const scale = scales[metric];

      // Create line generator with proper value transformation
      const line = d3.line<TrendData>()
        .x(d => xScale(d.timestamp))
        .y(d => {
          const value = this.getMetricValue(d, metric) || 0;
          // Normalize avgTime to seconds if using dual axis
          const transformedValue = (this.config.useDualAxis !== false && metric === 'avgTime') 
            ? value / 1000 : value;
          return scale(transformedValue);
        })
        .curve(d3.curveMonotoneX);

      // Create area generator with proper value transformation
      const area = d3.area<TrendData>()
        .x(d => xScale(d.timestamp))
        .y0(this.height)
        .y1(d => {
          const value = this.getMetricValue(d, metric) || 0;
          // Normalize avgTime to seconds if using dual axis
          const transformedValue = (this.config.useDualAxis !== false && metric === 'avgTime') 
            ? value / 1000 : value;
          return scale(transformedValue);
        })
        .curve(d3.curveMonotoneX);

      // Draw area (optional)
      if (metric === 'executions' || metric === 'cost') {
        linesGroup.append('path')
          .datum(this.data)
          .attr('class', `chart-area chart-area--${metric}`)
          .attr('d', area)
          .attr('fill', color);
      }

      // Draw line
      linesGroup.append('path')
        .datum(this.data)
        .attr('class', `chart-line chart-line--${metric}`)
        .attr('d', line)
        .attr('stroke', color);
    });
    
    // Then create dots group on top of everything
    const dotsGroup = g.append('g').attr('class', 'dots-group').style('pointer-events', 'all');
    
    // Draw all dots in a separate pass so they're all on top
    this.visibleMetrics.forEach((metric) => {
      if (this.hiddenMetrics.has(metric) || !scales[metric]) return;
      
      const color = this.getMetricColor(metric);
      const scale = scales[metric];
      
      // Draw dots with click events - only for non-zero values
      const dotsData = this.data.filter(d => {
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
        .attr('fill', 'white')
        .style('cursor', 'pointer')
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
            this.dataPointClick.emit({ data: d, metric, event });
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
      <div>Executions: ${data.executions.toLocaleString()}</div>
      <div>Cost: $${data.cost.toFixed(4)}</div>
      <div>Tokens: ${data.tokens.toLocaleString()}</div>
      <div>Avg Time: ${(data.avgTime / 1000).toFixed(1)}s</div>
      <div>Errors: ${data.errors}</div>
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 11px; color: rgba(255,255,255,0.8);">
        Click data points to drill down
      </div>
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
  
  private getTimeFormat(): (date: Date) => string {
    if (this.data.length < 2) {
      return d3.timeFormat('%H:%M');
    }
    
    // Calculate the time span of the data
    const firstDate = this.data[0].timestamp;
    const lastDate = this.data[this.data.length - 1].timestamp;
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
    if (this.data.length < 2) {
      return 6;
    }
    
    // Calculate the time span of the data
    const firstDate = this.data[0].timestamp;
    const lastDate = this.data[this.data.length - 1].timestamp;
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