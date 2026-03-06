import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit
} from '@angular/core';
import {
  ViewGridAggregate,
  AggregateValueFormat,
  AggregateConditionalStyle
} from '@memberjunction/core-entities';
import { AggregateValue } from '@memberjunction/core';

/**
 * AggregatePanelComponent displays aggregate values in a card-based panel.
 * Can be positioned to the right or bottom of the grid, with various layout options.
 *
 * Features:
 * - Collapsible panel with customizable title
 * - Multiple layout options (horizontal, vertical, grid)
 * - Value formatting (number, currency, percent, date)
 * - Conditional styling (green/yellow/red based on value thresholds)
 * - Icon support for visual indicators
 */
@Component({
  standalone: false,
  selector: 'mj-aggregate-panel',
  templateUrl: './aggregate-panel.component.html',
  styleUrls: ['./aggregate-panel.component.css']
})
export class AggregatePanelComponent implements OnInit {
  /**
   * Array of aggregate configurations to display
   */
  @Input() Aggregates: ViewGridAggregate[] = [];

  /**
   * Map of aggregate values, keyed by expression or id
   */
  @Input() Values: Map<string, AggregateValue> = new Map();

  /**
   * Panel position relative to the grid
   */
  @Input() Position: 'right' | 'bottom' = 'right';

  /**
   * Panel width in pixels (only applies when Position is 'right')
   */
  @Input() Width: number = 280;

  /**
   * Layout style for aggregate cards
   */
  @Input() Layout: 'horizontal' | 'vertical' | 'grid' = 'vertical';

  /**
   * Number of columns when Layout is 'grid'
   */
  @Input() GridColumns: number = 2;

  /**
   * Panel title
   */
  @Input() Title: string = 'Summary';

  /**
   * Whether the panel can be collapsed
   */
  @Input() Collapsible: boolean = true;

  /**
   * Whether the panel starts in collapsed state
   */
  @Input() StartCollapsed: boolean = false;

  /**
   * Whether aggregates are currently loading
   */
  @Input() Loading: boolean = false;

  /**
   * Emitted when panel collapsed state changes
   */
  @Output() CollapsedChange = new EventEmitter<boolean>();

  /**
   * Emitted when user clicks an aggregate card (for editing/details)
   */
  @Output() AggregateClick = new EventEmitter<ViewGridAggregate>();

  IsCollapsed = false;

  ngOnInit(): void {
    this.IsCollapsed = this.StartCollapsed;
  }

  /**
   * Toggle panel collapsed state
   */
  ToggleCollapse(): void {
    if (this.Collapsible) {
      this.IsCollapsed = !this.IsCollapsed;
      this.CollapsedChange.emit(this.IsCollapsed);
    }
  }

  /**
   * Handle click on an aggregate card
   */
  OnAggregateClick(agg: ViewGridAggregate): void {
    this.AggregateClick.emit(agg);
  }

  /**
   * Get the formatted value for an aggregate
   */
  FormatValue(agg: ViewGridAggregate): string {
    const key = agg.id || agg.expression;
    const value = this.Values.get(key);

    if (value == null) return '—';

    const format = agg.format || {};
    return this.formatByType(value, format);
  }

  /**
   * Get the CSS class for conditional styling
   */
  GetStyleClass(agg: ViewGridAggregate): string {
    const key = agg.id || agg.expression;
    const value = this.Values.get(key);

    if (value == null || !agg.conditionalStyles?.length) return '';

    for (const rule of agg.conditionalStyles) {
      if (this.evaluateCondition(value, rule)) {
        return `style-${rule.style}`;
      }
    }
    return '';
  }

  /**
   * Get enabled aggregates (filter out disabled ones)
   */
  get EnabledAggregates(): ViewGridAggregate[] {
    return this.Aggregates.filter(a => a.enabled !== false);
  }

  /**
   * Get card aggregates sorted by order
   */
  get CardAggregates(): ViewGridAggregate[] {
    return this.EnabledAggregates
      .filter(a => a.displayType === 'card')
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  /**
   * Get panel style for right position
   */
  get PanelStyle(): Record<string, string> {
    if (this.Position === 'right') {
      return {
        width: `${this.Width}px`,
        minWidth: `${this.Width}px`
      };
    }
    return {};
  }

  /**
   * Get grid template columns for grid layout
   */
  get GridTemplateColumns(): string {
    if (this.Layout === 'grid') {
      return `repeat(${this.GridColumns}, 1fr)`;
    }
    return '';
  }

  /**
   * Format value based on type configuration
   */
  private formatByType(value: AggregateValue, format: AggregateValueFormat): string {
    if (value == null) return '—';

    // Handle prefix/suffix
    const prefix = format.prefix || '';
    const suffix = format.suffix || '';

    // Handle different value types
    if (typeof value === 'number') {
      const formatted = this.formatNumber(value, format);
      return `${prefix}${formatted}${suffix}`;
    }

    if (value instanceof Date) {
      return this.formatDate(value, format.dateFormat);
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    // String or unknown type
    return `${prefix}${String(value)}${suffix}`;
  }

  /**
   * Format a number value
   */
  private formatNumber(value: number, format: AggregateValueFormat): string {
    const options: Intl.NumberFormatOptions = {
      minimumFractionDigits: format.decimals ?? 0,
      maximumFractionDigits: format.decimals ?? 2,
      useGrouping: format.thousandsSeparator !== false
    };

    // Handle currency
    if (format.currencyCode) {
      options.style = 'currency';
      options.currency = format.currencyCode;
    }

    try {
      return new Intl.NumberFormat('en-US', options).format(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Format a date value
   */
  private formatDate(value: Date, dateFormat?: string): string {
    try {
      // Simple format presets
      const options: Intl.DateTimeFormatOptions = {};

      switch (dateFormat) {
        case 'short':
          options.dateStyle = 'short';
          break;
        case 'medium':
          options.dateStyle = 'medium';
          break;
        case 'long':
          options.dateStyle = 'long';
          break;
        default:
          options.dateStyle = 'medium';
      }

      return new Intl.DateTimeFormat('en-US', options).format(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Evaluate a conditional styling rule
   */
  private evaluateCondition(value: AggregateValue, rule: AggregateConditionalStyle): boolean {
    // For non-numeric values, only support equality checks
    if (typeof value !== 'number') {
      if (rule.operator === 'eq') return value === rule.value;
      if (rule.operator === 'neq') return value !== rule.value;
      return false;
    }

    const numValue = Number(rule.value);
    const numValue2 = rule.value2 != null ? Number(rule.value2) : numValue;

    switch (rule.operator) {
      case 'gt': return value > numValue;
      case 'gte': return value >= numValue;
      case 'lt': return value < numValue;
      case 'lte': return value <= numValue;
      case 'eq': return value === numValue;
      case 'neq': return value !== numValue;
      case 'between': return value >= numValue && value <= numValue2;
      default: return false;
    }
  }
}
